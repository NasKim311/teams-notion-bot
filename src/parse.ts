import { extractDevInfo } from "./extract";
import { isCodeLine, labelKey, matchSectionLabel, PRIMARY_LABELS } from "./sections";
import type { Issue, IssueType } from "./types";

// 붙여넣은 Teams 대화 텍스트 → Issue 초안.
// 추천 양식(필드 줄)이 있으면 우선 사용하고, 없으면 Teams 복사 형식에서 추정한다.
//
//   [버그] 첫 줄은 제목
//   작성자: 홍길동
//   본문...
// Teams 메시지 링크(링크:/원문: 줄, 링크만 있는 줄)는 저장하지 않고 본문에서 뺀다.

const TITLE_MAX = 50;
const NAME_MAX = 40;
export const UNTITLED = "(제목 없음)";
export const UNKNOWN_AUTHOR = "알 수 없음";
/** 본문에서 Teams 머리글(작성자·시간)을 대신하는 줄의 접두어 */
export const HEADER_MARK = "— ";

const TYPE_TAG = /\[(버그|개선|운영)\]/;
const TYPE_TAG_ALL = /\[(?:버그|개선|운영)\]/g;
// 태그가 없을 때의 신호. 우선순위: 버그 > 운영 > 개선
const BUG_SIGNALS = /버그|에러|오류|안됨|안 됨|기대\s*동작|이슈\s*원인|이슈\s*현상|현상\s*[:：]|문제점|발생/;
const OPS_SIGNALS = /할당|운영팀|운영\s*일감/;
const IMPROVEMENT_SIGNALS = /개선|제안|리팩[토터]링|가독성|나을\s*것|좋을\s*것|주석/;

const FIELD_LINE = /^(제목|작성자|원문 링크|원문|링크)\s*[:：]\s*(.*)$/;
const TEAMS_LINK = /^https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)\/l\/message\/[^\s<>"'\])]+$/;
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

const FILE_PATH = /(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|vue|scss|css|less|json|html)\b/g;
const LINE_REF = /\d+\s*[~-]\s*\d+\s*(?:번째\s*)?줄|\d+\s*번째\s*줄|\d+\s*줄/g;
const LEADING_PARTICLE = /^(의|에서|에|를|을|은|는|이|가)\s+/;

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

/** [버그]/[개선]/[운영] 태그 우선, 없으면 신호 단어로 분류한다 (버그 > 운영 > 개선). */
export function classify(text: string): IssueType {
  const tag = text.match(TYPE_TAG)?.[1];
  if (tag === "버그" || tag === "개선" || tag === "운영") return tag;
  if (BUG_SIGNALS.test(text)) return "버그";
  if (OPS_SIGNALS.test(text)) return "운영";
  if (IMPROVEMENT_SIGNALS.test(text)) return "개선";
  return "기타";
}

const COMPLETE_SIGNALS = /수정하여\s*전달|수정\s*완료|해결\s*완료|처리\s*완료|배포\s*완료|머지\s*완료|merge_requests\/\d+|이슈\s*해결\s*[:：]/i;
const IN_PROGRESS_SIGNALS = /브랜치\s*(명)?\s*[:：]|작업\s*중|진행\s*중|확인\s*중|티켓\s*생성|일감\s*생성/;

/** 기존 이슈 업데이트 시 추천할 상태 단계. */
export function suggestStatusKind(text: string): "complete" | "inProgress" | null {
  if (COMPLETE_SIGNALS.test(text)) return "complete";
  if (IN_PROGRESS_SIGNALS.test(text)) return "inProgress";
  return null;
}

/** 유형 태그를 빼고 최대 50자로 자른다. */
export function makeTitle(text: string): string {
  const title = text.replace(TYPE_TAG_ALL, "").replace(/\s+/g, " ").trim();
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
    if (stampFirst?.[2] && isLikelyName(stampFirst[2])) unit = { author: stampFirst[2].trim(), stamp: stampFirst[1] ?? null, lineCount: 1 };
    else if (nameFirst?.[1] && isLikelyName(nameFirst[1])) unit = { author: nameFirst[1].trim(), stamp: nameFirst[2] ?? null, lineCount: 1 };
  }

  if (unit && EDITED.test(lines[index + unit.lineCount]?.trim() ?? "")) unit.lineCount += 1;
  return unit;
}

const headerLine = (unit: HeaderUnit) => `${HEADER_MARK}${unit.author}${unit.stamp ? ` · ${unit.stamp}` : ""}`;
export const isHeaderLine = (line: string) => line.startsWith(HEADER_MARK);

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

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** 주 내용 줄에서 파일 경로·줄 번호를 걷어낸 요약 문장. */
function summaryOf(line: string): string {
  return line
    .replace(FILE_PATH, " ")
    .replace(LINE_REF, " ")
    .replace(TYPE_TAG_ALL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_PARTICLE, "")
    .trim();
}

/**
 * 제목: "파일명: 요약" (파일이 없으면 요약만).
 * 요약은 이슈 사항/이슈/현상 같은 주 섹션의 첫 문장, 없으면 본문 첫 문장에서 고른다.
 */
export function makeIssueTitle(lines: string[]): string {
  const content = lines.filter((line) => line.trim() !== "" && !isHeaderLine(line));

  let primary = content;
  const start = content.findIndex((line) => {
    const section = matchSectionLabel(line);
    return section !== null && PRIMARY_LABELS.has(labelKey(section.label.replace(/\s*\d+$/, "")));
  });
  if (start !== -1) {
    const rest = content.slice(start + 1);
    const end = rest.findIndex((line) => matchSectionLabel(line) !== null);
    const first = matchSectionLabel(content[start] ?? "")?.rest ?? "";
    primary = [first, ...(end === -1 ? rest : rest.slice(0, end))].filter((line) => line !== "");
  }

  const file = [...primary, content[0] ?? ""].join("\n").match(FILE_PATH)?.[0];
  const summary =
    primary
      .filter((line) => !isCodeLine(line) && !line.trim().startsWith("=>"))
      .map((line) => {
        const section = matchSectionLabel(line);
        return summaryOf(section ? section.rest : line);
      })
      .find((text) => Array.from(text).length >= 2) ?? "";

  const base = file ? basename(file) : "";
  if (base && summary) return makeTitle(`${base}: ${summary}`);
  return makeTitle(summary || base);
}

export interface ParseOptions {
  /** Redmine 일감 주소 접두어 */
  redmineIssueUrl?: string;
}

interface Prepared {
  title?: string;
  author?: string;
  /** 필드 줄을 빼고 머리글을 한 줄로 정리한 본문 줄 */
  lines: string[];
}

/** 필드 줄(제목/작성자/링크)과 Teams 머리글을 처리한다. */
function prepare(raw: string): Prepared {
  const text = normalizeText(raw);

  let title: string | undefined;
  let author: string | undefined;
  const bodyLines: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const field = trimmed.match(FIELD_LINE);
    if (field) {
      const [, key, value = ""] = field;
      if (key === "제목") title ??= value.trim() || undefined;
      else if (key === "작성자") author ??= value.trim() || undefined;
      continue;
    }
    if (TEAMS_LINK.test(trimmed)) continue;
    bodyLines.push(line);
  }

  const rewritten = rewriteHeaders(bodyLines);
  return { title, author: author ?? rewritten.author, lines: rewritten.lines };
}

/** Teams 표시 이름에서 이름만 남긴다: "정주영(사원) - 유젠" → "정주영". Notion select 옵션이라 쉼표는 뺀다. */
export function personName(author: string): string {
  const name = author.split(/\(|\s-\s/)[0]?.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return name || author.replace(/,/g, " ").trim();
}

function buildIssue(lines: string[], prepared: Prepared, options: ParseOptions): Issue {
  const body = normalizeText(lines.join("\n"));
  const { title } = prepared;

  return {
    title: title ? makeTitle(title) : makeIssueTitle(lines),
    type: classify(`${title ?? ""}\n${body}`),
    body,
    author: prepared.author ? personName(prepared.author) : UNKNOWN_AUTHOR,
    ...extractDevInfo(`${title ?? ""}\n${body}`, options.redmineIssueUrl),
  };
}

const isPrimarySection = (line: string) => {
  const section = matchSectionLabel(line);
  return section !== null && section.number === undefined && PRIMARY_LABELS.has(labelKey(section.label));
};

/**
 * 한 메시지에 이슈가 여러 개면 나눈다. 나눌 수 없으면 null.
 *  - "이슈 1)", "이슈 2)" 번호 라벨: 같은 번호끼리 모은다 (나중에 달린 답글의 "이슈 1)"도 1번에 합쳐짐)
 *  - 그 외 "[ 이슈 ]"/"이슈 사항 :" 같은 주 섹션이 2번 이상: 등장할 때마다 나눈다
 * 첫 라벨 앞의 내용(머리글, 브랜치 등)은 공통 맥락으로 각 이슈 앞에 붙인다.
 */
export function splitIssueLines(lines: string[]): string[][] | null {
  const numbered = new Map<number, string[]>();
  const preamble: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const number = matchSectionLabel(line)?.number;
    if (number !== undefined) {
      current = numbered.get(number) ?? [];
      numbered.set(number, current);
    }
    (current ?? preamble).push(line);
  }
  if (numbered.size >= 2) {
    return [...numbered.entries()].sort(([a], [b]) => a - b).map(([, chunk]) => [...preamble, ...chunk]);
  }

  const starts = lines.flatMap((line, index) => (isPrimarySection(line) ? [index] : []));
  if (starts.length < 2) return null;
  const head = lines.slice(0, starts[0]);
  return starts.map((start, i) => [...head, ...lines.slice(start, starts[i + 1] ?? lines.length)]);
}

export function parsePastedText(raw: string, options: ParseOptions = {}): Issue {
  const prepared = prepare(raw);
  return buildIssue(prepared.lines, prepared, options);
}

/** 여러 이슈로 나눌 수 있는지 확인하고, split이면 나눠서 돌려준다. 제목: 필드가 있으면 나누지 않는다. */
export function parseIssues(raw: string, options: ParseOptions & { split?: boolean } = {}): { issues: Issue[]; splittable: boolean } {
  const prepared = prepare(raw);
  const chunks = prepared.title ? null : splitIssueLines(prepared.lines);
  if (!chunks || options.split === false) {
    return { issues: [buildIssue(prepared.lines, prepared, options)], splittable: chunks !== null };
  }
  return { issues: chunks.map((chunk) => buildIssue(chunk, prepared, options)), splittable: true };
}
