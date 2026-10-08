// 기존 Notion 페이지 본문을 현재 고정 틀(src/structure.ts)로 다시 쓴다.
// 처음 등록된 본문(첫 구분선 앞)의 글 블록만 바꾸고, 스크린샷과 업데이트(구분선 뒤)는 그대로 둔다.
// 사용:
//   npm run notion:restructure                       미리보기만 (scripts/.backups/restructure-preview-*.txt에 전체 결과)
//   npm run notion:restructure -- --apply            적용 (원본 블록은 scripts/.backups/에 백업)
//   npm run notion:restructure -- --apply --skip <페이지ID,...>
import { mkdirSync, writeFileSync } from "node:fs";
import { toBlocks } from "../src/blocks";
import { structureBody } from "../src/structure";
import { blocksToText, readOriginalBody } from "./lib/body";
import { notion, plain, queryAllPages } from "./lib/notion";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const skipIndex = args.indexOf("--skip");
const skip = new Set(
  skipIndex === -1 ? [] : (args[skipIndex + 1] ?? "").split(",").map((id) => id.replace(/-/g, "").trim()),
);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("scripts/.backups", { recursive: true });

type Plan = {
  id: string;
  title: string;
  before: string;
  after: string;
  blocks: any[];
  textBlocks: any[];
  lastTextId: string;
};
const plans: Plan[] = [];
const preview: string[] = [];

for (const page of await queryAllPages()) {
  const id = String(page.id);
  const title = plain(page.properties["제목"]?.title);
  const original = await readOriginalBody(id);
  const blocks = toBlocks(structureBody(original.text));
  const after = blocksToText(blocks);

  let mark = "변경";
  if (skip.has(id.replace(/-/g, ""))) mark = "제외";
  else if (original.problems.length > 0) mark = `건너뜀 (${original.problems.join(", ")})`;
  else if (original.textBlocks.length === 0 || blocks.length === 0) mark = "건너뜀 (글 없음)";
  else if (after === original.text) mark = "같음";

  console.log(`[${mark}] ${title}`);
  preview.push(`════ [${mark}] ${title} (${id})`, "── 이전", original.text, "── 이후", after, "");
  if (mark === "변경") {
    plans.push({
      id,
      title,
      before: original.text,
      after,
      blocks,
      textBlocks: original.textBlocks,
      lastTextId: original.textBlocks.at(-1).id,
    });
  }
}

const previewPath = `scripts/.backups/restructure-preview-${stamp}.txt`;
writeFileSync(previewPath, preview.join("\n"));
console.log(`\n${plans.length}건 변경 대상. 전체 이전/이후 비교: ${previewPath}`);

if (!apply) {
  console.log("미리보기만 했습니다. 적용하려면 --apply");
} else if (plans.length > 0) {
  const backupPath = `scripts/.backups/bodies-${stamp}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      plans.map(({ id, title, textBlocks }) => ({ id, title, textBlocks })),
      null,
      2,
    ),
  );
  console.log(`원본 블록 백업: ${backupPath}`);

  for (const plan of plans) {
    // 1) 새 블록을 기존 글 블록 바로 뒤(이미지·업데이트 앞)에 넣고  2) 기존 글 블록을 지운다
    let after = plan.lastTextId;
    for (let i = 0; i < plan.blocks.length; i += 100) {
      const data = await notion("PATCH", `/blocks/${plan.id}/children`, {
        children: plan.blocks.slice(i, i + 100),
        after,
      });
      after = data.results.at(-1)?.id ?? after;
    }
    for (const block of plan.textBlocks) await notion("DELETE", `/blocks/${block.id}`);
    console.log(`  적용: ${plan.title}`);
  }
  console.log(`${plans.length}건 적용 완료. 지운 블록은 Notion 휴지통/페이지 기록에서도 되살릴 수 있습니다.`);
}
