// 기존 Notion 페이지 제목을 현재 제목 규칙(src/parse.ts)으로 다시 만든다.
// 사용:
//   npm run notion:retitle                       미리보기만 (아무것도 바꾸지 않음)
//   npm run notion:retitle -- --apply            적용 (이전 제목은 scripts/.backups/에 백업)
//   npm run notion:retitle -- --apply --skip <페이지ID,...>   일부 페이지 제외 (사람이 직접 고친 제목 등)
import { mkdirSync, writeFileSync } from "node:fs";
import { parseIssues } from "../src/issue/parse";
import { UNTITLED } from "../src/issue/title";
import { readOriginalBody } from "./lib/body";
import { notion, plain, queryAllPages } from "./lib/notion";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const skipIndex = args.indexOf("--skip");
const skip = new Set(
  skipIndex === -1 ? [] : (args[skipIndex + 1] ?? "").split(",").map((id) => id.replace(/-/g, "").trim()),
);

const changes: { id: string; old: string; next: string }[] = [];
const pages = await queryAllPages();
for (const page of pages) {
  const old = plain(page.properties["제목"]?.title);
  const id = String(page.id);
  const { issues } = parseIssues((await readOriginalBody(id)).text, { split: false });
  const next = issues[0]?.title ?? UNTITLED;
  const skipped = skip.has(id.replace(/-/g, ""));
  const mark = skipped ? "제외" : old === next ? "같음" : next === UNTITLED ? "건너뜀" : "변경";
  console.log(`[${mark}] ${id}\n    ${old}\n  → ${next}`);
  if (mark === "변경") changes.push({ id, old, next });
}
console.log(`\n${pages.length}건 중 ${changes.length}건 변경 대상`);

if (!apply) {
  console.log("미리보기만 했습니다. 적용하려면 --apply");
} else if (changes.length > 0) {
  mkdirSync("scripts/.backups", { recursive: true });
  const backup = `scripts/.backups/titles-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backup, JSON.stringify(changes, null, 2));
  for (const change of changes) {
    await notion("PATCH", `/pages/${change.id}`, {
      properties: { 제목: { title: [{ type: "text", text: { content: change.next } }] } },
    });
  }
  console.log(`${changes.length}건 적용 완료. 이전 제목 백업: ${backup}`);
}
