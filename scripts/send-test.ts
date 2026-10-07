// 로컬 wrangler dev 서버에 서명된 Teams payload를 보낸다.
//   npm run send-test                          # fixture 그대로
//   npm run send-test -- "[개선] 다크모드 지원"   # text만 바꿔서
// 대상 URL은 SEND_TEST_URL 환경변수로 바꿀 수 있다 (기본 http://localhost:8787).
import { readFileSync } from "node:fs";
import { computeSignature } from "../src/verify.ts";

const root = new URL("../", import.meta.url);
const targetUrl = process.env.SEND_TEST_URL ?? "http://localhost:8787";

function readDevVars(): Record<string, string> {
  let content: string;
  try {
    content = readFileSync(new URL(".dev.vars", root), "utf8");
  } catch {
    throw new Error(".dev.vars 파일이 없습니다. .dev.vars.example을 복사해 값을 채워주세요.");
  }

  const vars: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match?.[1] || line.trimStart().startsWith("#")) continue;
    vars[match[1]] = (match[2] ?? "").replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}

async function main(): Promise<void> {
  const secret = readDevVars().TEAMS_HMAC_SECRET;
  if (!secret) throw new Error(".dev.vars에 TEAMS_HMAC_SECRET이 비어 있습니다.");

  const payload = JSON.parse(readFileSync(new URL("test/fixtures/teams-payload.json", root), "utf8"));
  const text = process.argv[2];
  if (text) payload.text = `<at>이슈봇</at> ${text}`;

  const body = JSON.stringify(payload);
  const signature = await computeSignature(body, secret);

  console.log(`POST ${targetUrl}`);
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: { Authorization: `HMAC ${signature}`, "Content-Type": "application/json" },
    body,
  });

  const responseText = await res.text();
  console.log(`status: ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(responseText), null, 2));
  } catch {
    console.log(responseText);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
