import { TYPE_TAG } from "./classify";
import { matchSectionLabel } from "./sections";
import { HEADER_MARK } from "./text";

// Teams 복사본의 머리글(작성자·시간) 인식과 작성자 이름 정리.

const NAME_MAX = 40;

export const UNKNOWN_AUTHOR = "알 수 없음";

const ANY_LINK = /https?:\/\/[^\s<>"'\])]+/;

// Teams 머리글: "홍길동 오후 4:30", "[오후 4:30] 홍길동", "홍길동(사원) - 유젠\n2026-09-30 오후 1:25", "오후 5:20\n홍길동(사원) - 유젠"
const TIME = String.raw`(?:(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)`;
const DATE = String.raw`(?:\d{4}[-./]\s?\d{1,2}[-./]\s?\d{1,2}\.?|\d{1,2}[/.-]\d{1,2}|\d{1,2}월\s*\d{1,2}일|어제|오늘)`;
const STAMP = String.raw`(?:(?:${DATE}\s*)?${TIME}|${DATE})`;
// 한 줄 머리글은 시간이 있어야 인정한다 ("로그인 오류 2.1" 같은 제목을 작성자로 오인하지 않도록).
const TIMED_STAMP = String.raw`(?:${DATE}\s*)?${TIME}`;
const STAMP_ONLY = new RegExp(String.raw`^\[?${STAMP}\]?$`);
const NAME_THEN_STAMP = new RegExp(String.raw`^(.+?)[\s,]+\[?(${TIMED_STAMP})\]?$`);
const STAMP_THEN_NAME = new RegExp(String.raw`^\[(${TIMED_STAMP})\]\s*(.+)$`);
/** Teams 표시 이름: 정주영(사원) - 유젠 */
const DISPLAY_NAME = /^[^()\s][^()]{0,19}\([^()]{1,10}\)(?:\s*-\s*\S.{0,29})?$/;
const EDITED = /^(편집됨|Edited)$/;

function isLikelyName(text: string): boolean {
  const name = text.trim();
  return (
    name !== "" &&
    Array.from(name).length <= NAME_MAX &&
    !ANY_LINK.test(name) &&
    !TYPE_TAG.test(name) &&
    !/[.?!:~]$/.test(name) &&
    matchSectionLabel(name) === null
  );
}

const isShortName = (text: string) => isLikelyName(text) && !/\s/.test(text) && Array.from(text).length <= 12;

export interface HeaderUnit {
  author: string;
  stamp: string | null;
  lineCount: number;
}

/**
 * lines[index]에서 시작하는 Teams 머리글을 찾는다.
 * strict 모드(본문 중간)에서는 "표시 이름 + 시간 줄" 두 줄 형태만 인정한다.
 */
export function matchHeaderAt(lines: string[], index: number, strict = false): HeaderUnit | null {
  const first = lines[index]?.trim() ?? "";
  const second = lines[index + 1]?.trim() ?? "";
  if (first === "") return null;

  let unit: HeaderUnit | null = null;
  if ((strict ? DISPLAY_NAME.test(first) : isLikelyName(first)) && STAMP_ONLY.test(second)) {
    unit = { author: first, stamp: second, lineCount: 2 };
  } else if (STAMP_ONLY.test(first) && (DISPLAY_NAME.test(second) || (!strict && isShortName(second)))) {
    unit = { author: second, stamp: first, lineCount: 2 };
  } else if (!strict && !STAMP_ONLY.test(first)) {
    const stampFirst = first.match(STAMP_THEN_NAME);
    const nameFirst = first.match(NAME_THEN_STAMP);
    if (stampFirst?.[2] && isLikelyName(stampFirst[2]))
      unit = { author: stampFirst[2].trim(), stamp: stampFirst[1] ?? null, lineCount: 1 };
    else if (nameFirst?.[1] && isLikelyName(nameFirst[1]))
      unit = { author: nameFirst[1].trim(), stamp: nameFirst[2] ?? null, lineCount: 1 };
  }

  if (unit && EDITED.test(lines[index + unit.lineCount]?.trim() ?? "")) unit.lineCount += 1;
  return unit;
}

const headerLine = (unit: HeaderUnit) => `${HEADER_MARK}${unit.author}${unit.stamp ? ` · ${unit.stamp}` : ""}`;

/**
 * Teams 머리글을 "— 이름 · 시간" 한 줄로 바꾼다.
 * 맨 앞에 연달아 붙은 머리글(전달된 메시지)은 마지막 것이 원래 작성자다.
 */
export function rewriteHeaders(lines: string[]): { lines: string[]; author: string | undefined } {
  const out: string[] = [];
  let author: string | undefined;
  let atTop = true;

  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      out.push(line);
      i += 1;
      continue;
    }
    const unit = matchHeaderAt(lines, i, !atTop);
    if (unit) {
      if (atTop) author = unit.author;
      out.push(headerLine(unit));
      i += unit.lineCount;
      continue;
    }
    atTop = false;
    out.push(line);
    i += 1;
  }
  return { lines: out, author };
}

/** Teams 표시 이름에서 이름만 남긴다: "정주영(사원) - 유젠" → "정주영". Notion select 옵션이라 쉼표는 뺀다. */
export function personName(author: string): string {
  const name = author
    .split(/\(|\s-\s/)[0]
    ?.replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name || author.replace(/,/g, " ").trim();
}
