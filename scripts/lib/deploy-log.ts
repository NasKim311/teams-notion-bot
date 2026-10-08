// 배포 태그 이름, 바뀐 것 목록, docs/deployments.md 항목 만들기. 순수 함수 (git·wrangler 호출은 scripts/deploy.ts).

export const TAG_PREFIX = "deploy-";
/** 기록 문서에서 새 항목이 들어갈 자리 (이 줄 바로 아래, 최신이 위) */
export const ENTRY_MARKER = "<!-- 새 배포 기록은 이 줄 아래에 자동으로 추가된다 -->";
/** Cloudflare 버전 메시지 길이 제한 */
const MESSAGE_MAX = 100;
/** 기록에 남길 커밋: feat/fix (번호 포함). "fix(B1): …" → "B1 …" */
const CHANGE_SUBJECT = /^(feat|fix)(?:\(([^)]+)\))?:\s*(.+)$/;

/** 한국 시간 "2026-10-08 17:34" */
export function koreanTime(now: Date): string {
  return now.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);
}

/** 그날 다음 배포 태그: deploy-2026-10-08.1, .2, … */
export function nextTag(existingTags: string[], now: Date): string {
  const prefix = `${TAG_PREFIX}${koreanTime(now).slice(0, 10)}.`;
  const used = existingTags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => Number(tag.slice(prefix.length)))
    .filter(Number.isInteger);
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

/** 커밋 제목들에서 사용자에게 의미 있는 변경(feat/fix)만 */
export function changeLines(subjects: string[]): string[] {
  return subjects.flatMap((subject) => {
    const match = CHANGE_SUBJECT.exec(subject.trim());
    if (!match) return [];
    const [, kind, scope, text] = match;
    const label = kind === "fix" ? "버그" : "기능";
    return [`${label}${scope ? ` ${scope}` : ""}: ${text}`];
  });
}

/** wrangler deploy --message 값: "0954622 feat: …" (100자 이내) */
export function versionMessage(commit: string, subject: string): string {
  const message = `${commit} ${subject}`;
  const chars = Array.from(message);
  return chars.length <= MESSAGE_MAX ? message : chars.slice(0, MESSAGE_MAX).join("");
}

/** wrangler deploy 출력에서 "Current Version ID: …" */
export function readVersionId(output: string): string | null {
  return /Current Version ID:\s*([0-9a-f-]{36})/.exec(output)?.[1] ?? null;
}

export type DeployRecord = { tag: string; time: string; versionId: string; commit: string; changes: string[] };

/** 기록 문서의 배포 한 건 */
export function deployEntry(record: DeployRecord): string {
  const changes =
    record.changes.length > 0 ? record.changes : ["사용자에게 보이는 변경 없음 (문서·구조 정리 또는 다시 배포)"];
  return [
    `## ${record.tag} (${record.time})`,
    `- Version ID: \`${record.versionId}\` · 커밋: \`${record.commit}\``,
    ...changes.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

/** 표시 줄 바로 아래(최신이 위)에 항목을 넣는다. 표시 줄이 없으면 null */
export function insertEntry(doc: string, entry: string): string | null {
  const at = doc.indexOf(ENTRY_MARKER);
  if (at < 0) return null;
  const end = at + ENTRY_MARKER.length;
  const rest = doc.slice(end).replace(/^\n+/, "");
  return `${doc.slice(0, end)}\n\n${entry}${rest ? `\n${rest}` : ""}`;
}
