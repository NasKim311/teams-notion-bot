// 팀 공지 <이슈 공유 양식>의 예시 문구와 구분선을 걷어낸다 (팀원이 예시를 지우지 않고 올려도 내용·컬럼에 들어가지 않게).

/** 팀 공지 양식의 예시 문구 (2026-10-13 공지). 공지를 바꾸면 여기와 page.ts의 TEMPLATE도 고친다. */
export const FORM_PLACEHOLDERS = [
  "어떤 화면에서 어떤 문제가 생기는지 (재현 방법 포함)",
  "문제가 생기는 화면 주소",
  "원래 어떻게 동작해야 하는지",
  "컴포넌트 경로:줄 번호 (예: src/views/fit/FitPage.tsx:75)",
  "이미지 등 참고할 만한 자료",
];

/** 띄어쓰기가 달라도 맞도록 글자 사이에 공백을 허용한다: "경로 : 줄 번호(예: …)"도 같은 문구 */
const PLACEHOLDER_PATTERNS = FORM_PLACEHOLDERS.map(
  (text) =>
    new RegExp(
      Array.from(text.replace(/\s+/g, ""))
        .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*"),
      "g",
    ),
);

/** 선으로만 된 구분선: "━━━━━━ <이슈 공유 양식> ━━━━━━", "──────", "-----" */
const DIVIDER_LINE = /^[━─═=\-_~]{3,}(?:\s*<[^<>]{1,30}>\s*[━─═=\-_~]{3,})?$/;

/** 구분선은 빼고, 예시 문구는 그 부분만 지운다 ("기대 동작 : <예시> → 실제 가격" → "기대 동작 : → 실제 가격"). */
export function stripFormPlaceholders(lines: string[]): string[] {
  return lines.flatMap((line) => {
    if (DIVIDER_LINE.test(line.trim())) return [];
    const stripped = PLACEHOLDER_PATTERNS.reduce((text, pattern) => text.replace(pattern, ""), line);
    return stripped === line ? [line] : [stripped.replace(/ {2,}/g, " ").trimEnd()];
  });
}
