// 운영 배포: 검사 → wrangler deploy(태그·메시지) → git 태그 → docs/deployments.md 기록 커밋.
// 사용: npm run deploy  (배포는 사용자가 지시할 때만. 절차: .claude/skills/deploy)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  changeLines,
  deployEntry,
  insertEntry,
  koreanTime,
  nextTag,
  readVersionId,
  TAG_PREFIX,
  versionMessage,
} from "./lib/deploy-log";

const LOG_FILE = "docs/deployments.md";
const CHECKS = ["npm run typecheck", "npm run lint", "npm test", "npm run notion:schema"];

const fail = (message: string): never => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

const git = (...args: string[]): string => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) fail(`git ${args[0]} 실패: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

// 1. 배포할 코드가 커밋과 정확히 같아야 기록이 의미 있다.
if (git("branch", "--show-current") !== "main") fail("main 브랜치에서만 배포한다.");
if (git("status", "--porcelain") !== "") fail("커밋하지 않은 변경이 있다. 커밋한 뒤 배포한다.");

for (const check of CHECKS) {
  console.log(`\n▶ ${check}`);
  // 고정된 명령만 넘기므로 shell을 써도 안전하다 (Windows에서 npm은 .cmd라 shell이 필요).
  if (spawnSync(check, { shell: true, stdio: "inherit" }).status !== 0) fail(`${check} 실패. 배포하지 않았다.`);
}

// 2. 배포
const commit = git("rev-parse", "--short", "HEAD");
const subject = git("log", "-1", "--format=%s");
const now = new Date();
const tag = nextTag(git("tag", "--list", `${TAG_PREFIX}*`).split("\n"), now);

console.log(`\n▶ wrangler deploy (${tag}, ${commit})`);
// npx(.cmd)를 거치지 않고 wrangler를 node로 직접 실행한다. 한글 메시지를 shell 따옴표 처리 없이 넘기기 위해서다.
const require = createRequire(import.meta.url);
// wrangler 패키지는 exports로 bin 경로를 막아 두어서 package.json의 bin으로 찾는다.
const wranglerPackage = require.resolve("wrangler/package.json");
const wrangler = join(dirname(wranglerPackage), require(wranglerPackage).bin.wrangler);
const deploy = spawnSync(
  process.execPath,
  [wrangler, "deploy", "--tag", tag, "--message", versionMessage(commit, subject)],
  { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
);
process.stdout.write(deploy.stdout ?? "");
const versionId = readVersionId(deploy.stdout ?? "");
if (deploy.status !== 0 || !versionId) fail("배포 실패 (Version ID 없음). 태그·기록은 남기지 않았다.");

// 3. 기록: 태그는 배포한 커밋에, 바뀐 것은 이전 배포 태그부터 지금까지의 feat/fix 커밋
const previous = spawnSync("git", ["describe", "--tags", "--abbrev=0", "--match", `${TAG_PREFIX}*`, "HEAD"], {
  encoding: "utf8",
});
const range = previous.status === 0 ? `${previous.stdout.trim()}..HEAD` : "HEAD";
const changes = changeLines(git("log", range, "--format=%s").split("\n"));

git("tag", "-a", tag, "HEAD", "-m", `운영 배포 ${koreanTime(now)} · Version ID ${versionId}`);

const entry = deployEntry({ tag, time: koreanTime(now), versionId: versionId ?? "", commit, changes });
const doc = insertEntry(readFileSync(LOG_FILE, "utf8"), entry);
if (doc === null) fail(`${LOG_FILE}에 기록 표시 줄이 없다. 배포·태그는 끝났으니 기록만 직접 추가한다.`);
writeFileSync(LOG_FILE, doc ?? "");
git("add", LOG_FILE);
git("commit", "-m", `chore: 배포 기록 ${tag}`);

console.log(`\n✓ 배포 완료: ${tag} · Version ID ${versionId} · 커밋 ${commit}`);
console.log(`  기록: ${LOG_FILE} (커밋됨). 원격에 올리려면: git push origin main --follow-tags`);
console.log(`  문제가 생기면: npx wrangler rollback <이전 배포의 Version ID> (${LOG_FILE} 참고)`);
