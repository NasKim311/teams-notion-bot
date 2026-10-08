import { isHeaderLine, normalizeText } from "./parse";
import { labelKey, matchSectionLabel } from "./sections";

// 새 이슈 본문을 고정 틀로 정리한다: 현상 → 기대 동작 → 원인 → 처리·해결 → 참고 (내용이 없어도 제목은 모두 넣음).
//  - 팀 양식 라벨을 표준 섹션으로 모은다
//  - 첫 메시지에서 라벨 없이 쓴 글은 현상으로
//  - Teams 머리글(작성자·시간)과 이후 답글의 라벨 없는 글(대화)은 넣지 않는다. 답글 속 라벨 글은 해당 섹션으로
//  - 브랜치·MR·레드마인 링크만 있는 줄은 컬럼에 있으므로 뺀다
// 결과는 "[ 🐞 현상 ]" 같은 대괄호 라벨 텍스트라 blocks.ts가 소제목으로 바꾼다.

type SectionId = "symptom" | "expected" | "cause" | "fix" | "note";
/** dev: 브랜치/MR 라벨 아래, skip: 답글의 라벨 없는 대화 */
type Target = SectionId | "dev" | "skip";

export const SECTION_TITLES: Record<SectionId, string> = {
  symptom: "🐞 현상",
  expected: "🎯 기대 동작",
  cause: "🔍 원인",
  fix: "🛠 처리·해결",
  note: "📎 참고",
};
const ORDER: SectionId[] = ["symptom", "expected", "cause", "fix", "note"];

const keyMap = (entries: [SectionId, string[]][]) =>
  new Map(entries.flatMap(([id, labels]) => labels.map((label) => [labelKey(label), id] as const)));

/** 표준 섹션으로 그대로 옮기는 라벨 */
const MAIN_LABELS = keyMap([
  ["symptom", ["이슈 사항", "이슈", "이슈 현상", "현상", "문제점"]],
  ["expected", ["기대 동작"]],
  ["cause", ["원인", "이슈 원인", "이슈 발생 원인"]],
  ["fix", ["해결", "해결 방법", "이슈 해결", "처리 상황", "개선", "처리·해결"]],
  ["note", ["참고"]],
]);
/** 섹션 안에 "▸ 라벨" 줄을 남기고 옮기는 라벨 (그 외 모르는 라벨은 참고로) */
const SUB_LABELS = keyMap([
  ["symptom", ["경로", "위치", "재현", "재현 방법"]],
  ["note", ["관련 추가 이슈", "우려"]],
]);
/** 값이 컬럼(브랜치 명·MR 링크)에 들어가는 라벨 */
const DEV_LABELS = new Set(["브랜치명", "작업 브랜치명", "Merge Request"].map(labelKey));
/** 줄 전체가 브랜치명 또는 MR/레드마인 링크뿐인 줄 */
const LONE_DEV_LINE =
  /^(?:(?:feature|bugfix|hotfix|release|fix|refactor)\/[\w.\-#/]+|https?:\/\/\S*(?:\/merge_requests\/\d+|redmine\S*\/issues\/\d+)\S*?)[.,]?$/i;

export function structureBody(body: string): string {
  const sections: Record<SectionId, string[]> = { symptom: [], expected: [], cause: [], fix: [], note: [] };
  let target: Target = "symptom";
  let devLabel = "";
  let seenContent = false;

  const push = (line: string) => {
    if (target !== "dev" && target !== "skip") sections[target].push(line);
  };

  function handleText(line: string) {
    if (LONE_DEV_LINE.test(line.trim())) return;
    if (target === "dev") {
      // 브랜치/MR 라벨 아래의 다른 설명은 참고로 옮긴다
      sections.note.push("", `▸ ${devLabel}`);
      target = "note";
    }
    push(line);
  }

  for (const line of body.split("\n")) {
    // 맨 앞 머리글(첫 메시지 작성자)은 건너뛰고, 내용 뒤에 나온 머리글은 답글의 시작
    if (isHeaderLine(line)) {
      if (seenContent) target = "skip";
      continue;
    }
    if (line.trim() === "") {
      push("");
      continue;
    }

    const section = matchSectionLabel(line);
    if (section) {
      seenContent = true;
      const key = labelKey(section.label);
      if (section.number !== undefined) {
        target = "symptom";
      } else if (DEV_LABELS.has(key)) {
        target = "dev";
        devLabel = section.label;
      } else {
        const main = MAIN_LABELS.get(key);
        if (main) {
          target = main;
        } else {
          const sub = SUB_LABELS.get(key) ?? "note";
          sections[sub].push("", `▸ ${section.label}`);
          target = sub;
        }
      }
      if (section.rest) handleText(section.rest);
      continue;
    }

    seenContent = true;
    handleText(line);
  }

  // 내용이 없어도 섹션 제목은 모두 넣는다 (나중에 Notion에서 채울 수 있도록)
  const out: string[] = [];
  for (const id of ORDER) {
    const text = sections[id].join("\n").trim();
    out.push(`[ ${SECTION_TITLES[id]} ]`, ...(text ? [text] : []), "");
  }
  return normalizeText(out.join("\n"));
}
