import { isHeaderLine, normalizeText } from "./parse";
import { labelKey, matchSectionLabel } from "./sections";

// 새 이슈 본문을 고정 틀로 정리한다: 현상 → 기대 동작 → 원인 → 처리·해결 → 참고 → 대화 기록.
//  - 팀 양식 라벨을 표준 섹션으로 모은다 (없는 섹션은 생략)
//  - 첫 메시지에서 라벨 없이 쓴 글은 현상으로
//  - 이후 답글(본문 중간 머리글)의 라벨 없는 글은 대화 기록으로, 라벨이 있으면 해당 섹션으로
//  - 브랜치·MR·레드마인 링크만 있는 줄은 컬럼에 있으므로 뺀다
// 결과는 "[ 🐞 현상 ]" 같은 대괄호 라벨 텍스트라 blocks.ts가 소제목으로 바꾼다.

type SectionId = "symptom" | "expected" | "cause" | "fix" | "note";
type Target = SectionId | "log" | "dev";

export const SECTION_TITLES: Record<SectionId | "log", string> = {
  symptom: "🐞 현상",
  expected: "🎯 기대 동작",
  cause: "🔍 원인",
  fix: "🛠 처리·해결",
  note: "📎 참고",
  log: "💬 대화 기록",
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
  const sections = new Map<SectionId, string[]>(ORDER.map((id) => [id, []]));
  const log: string[] = [];
  let target: Target = "symptom";
  let devLabel = "";
  let seenContent = false;

  const push = (line: string) => {
    if (target === "log") log.push(line);
    else if (target !== "dev") sections.get(target)!.push(line);
  };

  for (const line of body.split("\n")) {
    const text = line.trim();

    if (isHeaderLine(line)) {
      // 맨 앞 머리글(첫 메시지 작성자)은 기록만, 그 뒤 머리글은 답글의 시작
      log.push("", line);
      if (seenContent) target = "log";
      continue;
    }
    if (text === "") {
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
      } else if (MAIN_LABELS.has(key)) {
        target = MAIN_LABELS.get(key)!;
      } else {
        target = SUB_LABELS.get(key) ?? "note";
        sections.get(target)!.push("", `▸ ${section.label}`);
      }
      if (section.rest) handleText(section.rest);
      continue;
    }

    seenContent = true;
    handleText(line);
  }

  function handleText(line: string) {
    if (LONE_DEV_LINE.test(line.trim())) return;
    if (target === "dev") {
      // 브랜치/MR 라벨 아래의 다른 설명은 참고로 옮긴다
      sections.get("note")!.push("", `▸ ${devLabel}`);
      target = "note";
    }
    push(line);
  }

  const out: string[] = [];
  const add = (title: string, content: string[]) => {
    const text = content.join("\n").trim();
    if (text !== "") out.push(`[ ${title} ]`, text, "");
  };
  for (const id of ORDER) add(SECTION_TITLES[id], sections.get(id)!);
  add(SECTION_TITLES.log, log);
  return normalizeText(out.join("\n"));
}
