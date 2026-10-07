import type { Issue, IssueType } from "./types";

// 붙여넣은 Teams 대화 텍스트 → Issue 초안.
// 추천 양식(필드 줄)이 있으면 우선 사용하고, 없으면 Teams 복사 형식에서 추정한다.
//
//   [버그] 첫 줄은 제목
//   작성자: 홍길동
//   링크: https://teams.microsoft.com/l/message/...
//   본문...

const TITLE_MAX = 50;
const NAME_MAX = 40;
export const UNTITLED = "(제목 없음)";
export const UNKNOWN_AUTHOR = "알 수 없음";

// [운영]은 키워드 없이 태그로만 분류한다.
const TYPE_TAG = /\[(버그|개선|운영)\]/;
const TYPE_TAG_ALL = /\[(?:버그|개선|운영)\]/g;
const BUG_KEYWORDS = /버그|에러|안됨/;
const IMPROVEMENT_KEYWORDS = /개선|제안/;

const FIELD_LINE = /^(제목|작성자|원문 링크|원문|링크)\s*[:：]\s*(.*)$/;
const TEAMS_LINK = /https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)\/l\/message\/[^\s<>"'\])]+/;
const ANY_LINK = /https?:\/\/[^\s<>"'\])]+/;

// Teams 복사 시 붙는 머리글: "홍길동 오후 4:30", "홍길동, 2026-10-07 오후 4:30", "[오후 4:30] 홍길동"
const TIME = String.raw`(?:(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)`;
const DATE = String.raw`(?:\d{4}[-./]\s?\d{1,2}[-./]\s?\d{1,2}\.?|\d{1,2}[/.-]\d{1,2}|\d{1,2}월\s*\d{1,2}일|어제|오늘)`;
const STAMP = String.raw`(?:(?:${DATE}\s*)?${TIME}|${DATE})`;
// 한 줄 머리글은 시간이 있어야 인정한다 ("로그인 오류 2.1" 같은 제목을 작성자로 오인하지 않도록).
const TIMED_STAMP = String.raw`(?:${DATE}\s*)?${TIME}`;
const STAMP_ONLY = new RegExp(String.raw`^\[?${STAMP}\]?$`);
const NAME_THEN_STAMP = new RegExp(String.raw`^(.+?)[\s,]+\[?${TIMED_STAMP}\]?$`);
const STAMP_THEN_NAME = new RegExp(String.raw`^\[${TIMED_STAMP}\]\s*(.+)$`);

/** 줄바꿈 통일, 줄 끝 공백 제거, 연속 빈 줄 축소. 공백류(NBSP 등)는 일반 공백으로. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** [버그]/[개선]/[운영] 태그 우선, 없으면 키워드로 유형을 분류한다. */
export function classify(text: string): IssueType {
  const tag = text.match(TYPE_TAG)?.[1];
  if (tag === "버그" || tag === "개선" || tag === "운영") return tag;
  if (BUG_KEYWORDS.test(text)) return "버그";
  if (IMPROVEMENT_KEYWORDS.test(text)) return "개선";
  return "기타";
}

/** 첫 번째 비어있지 않은 줄에서 유형 태그를 뺀 뒤 최대 50자로 자른다. */
export function makeTitle(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
  const title = firstLine.replace(TYPE_TAG_ALL, "").replace(/\s+/g, " ").trim();
  if (title === "") return UNTITLED;

  const chars = Array.from(title);
  return chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX - 1).join("") + "…" : title;
}

function isLikelyName(text: string): boolean {
  const name = text.trim();
  return (
    name !== "" &&
    Array.from(name).length <= NAME_MAX &&
    !ANY_LINK.test(name) &&
    !TYPE_TAG.test(name) &&
    !/[.?!:]$/.test(name)
  );
}

/** 앞쪽 줄이 Teams 머리글이면 작성자 이름과 머리글이 차지한 줄 수를 돌려준다. */
export function detectHeader(lines: string[]): { author: string; lineCount: number } | null {
  const first = lines[0]?.trim() ?? "";
  if (first === "") return null;

  const second = lines[1]?.trim() ?? "";
  if (isLikelyName(first) && STAMP_ONLY.test(second)) return { author: first, lineCount: 2 };

  const name = first.match(STAMP_THEN_NAME)?.[1] ?? first.match(NAME_THEN_STAMP)?.[1];
  if (name && isLikelyName(name)) return { author: name.trim(), lineCount: 1 };
  return null;
}

export function parsePastedText(raw: string): Issue {
  const text = normalizeText(raw);

  let title: string | undefined;
  let author: string | undefined;
  let sourceUrl: string | undefined;
  const bodyLines: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const field = trimmed.match(FIELD_LINE);
    if (field) {
      const [, key, value = ""] = field;
      if (key === "제목") title ??= value.trim() || undefined;
      else if (key === "작성자") author ??= value.trim() || undefined;
      else sourceUrl ??= value.match(TEAMS_LINK)?.[0] ?? value.match(ANY_LINK)?.[0];
      continue;
    }
    // 링크만 있는 줄은 원문 링크로 쓰고 본문에서 뺀다.
    const lone = trimmed.match(TEAMS_LINK);
    if (lone && lone[0] === trimmed) {
      sourceUrl ??= trimmed;
      continue;
    }
    bodyLines.push(line);
  }
  sourceUrl ??= text.match(TEAMS_LINK)?.[0];

  // 앞쪽 빈 줄을 건너뛰고 Teams 머리글을 찾는다.
  const start = bodyLines.findIndex((line) => line.trim() !== "");
  const contentLines = start === -1 ? [] : bodyLines.slice(start);
  const header = detectHeader(contentLines);
  author ??= header?.author;

  const body = bodyLines.join("\n").trim();
  const titleSource = title ?? contentLines.slice(header?.lineCount ?? 0).join("\n");

  return {
    title: makeTitle(titleSource),
    type: classify(`${title ?? ""}\n${body}`),
    body,
    author: author ?? UNKNOWN_AUTHOR,
    sourceUrl: sourceUrl ?? null,
  };
}
