// Notion DB 실제 스키마를 출력하고, 코드(src/notion.ts의 PROP/PROP_TYPES)와 다른 점을 알려준다. 읽기 전용.
// 사용: npm run notion:schema
import { PROP, PROP_TYPES } from "../src/notion";
import { DATABASE_ID, notion, plain } from "./lib/notion";

type Property = { type: string; [key: string]: any };
const db = await notion<{ title: any[]; properties: Record<string, Property> }>("GET", `/databases/${DATABASE_ID}`);

console.log(`DB: ${plain(db.title)}\n`);
console.log("── 실제 컬럼");
for (const [name, property] of Object.entries(db.properties)) {
  let detail = "";
  if (property.type === "select" || property.type === "multi_select") {
    detail = ` [${property[property.type].options.map((o: { name: string }) => o.name).join(", ")}]`;
  }
  if (property.type === "status") {
    const byId = Object.fromEntries(property.status.options.map((o: { id: string; name: string }) => [o.id, o.name]));
    detail = " " + property.status.groups.map((g: { name: string; option_ids: string[] }) => `${g.name}{${g.option_ids.map((id) => byId[id]).join(", ")}}`).join(" ");
  }
  console.log(`  ${name} : ${property.type}${detail}`);
}

console.log("\n── 코드와 비교 (src/notion.ts PROP)");
let problems = 0;
for (const key of Object.keys(PROP) as (keyof typeof PROP)[]) {
  const name = PROP[key];
  const actual = db.properties[name]?.type;
  const expected = PROP_TYPES[key];
  if (!actual) {
    problems += 1;
    console.log(`  ✗ ${key}: "${name}" 컬럼이 DB에 없음 (이름이 바뀌었거나 삭제됨)`);
  } else if (actual !== expected) {
    problems += 1;
    console.log(`  ✗ ${key}: "${name}" 타입이 다름 — 코드 ${expected}, DB ${actual}`);
  } else {
    console.log(`  ✓ ${key}: "${name}" (${actual})`);
  }
}
const known = new Set<string>(Object.values(PROP));
const extra = Object.keys(db.properties).filter((name) => !known.has(name));
if (extra.length > 0) console.log(`\n── 코드가 쓰지 않는 컬럼: ${extra.join(", ")}`);
console.log(problems === 0 ? "\n코드와 DB가 맞습니다." : `\n맞지 않는 컬럼 ${problems}개 — notion-sync 절차로 맞추세요.`);
process.exitCode = problems === 0 ? 0 : 1;
