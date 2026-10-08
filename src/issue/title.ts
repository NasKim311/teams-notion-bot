import { TYPE_TAG_ALL } from "./classify";
import { isCodeLine, labelKey, matchSectionLabel, PRIMARY_LABELS } from "./sections";
import { isHeaderLine } from "./text";

// 제목 규칙: "[영역] 요약". 요약 문장을 다듬고, "…" 없이 절 단위로 끝맺는다.

const TITLE_MAX = 60;
/** 끊을 절이 없을 때 허용하는 최대 길이 */
const TITLE_HARD_MAX = 100;

export const UNTITLED = "(제목 없음)";

const FILE_PATH = /(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|vue|scss|css|less|json|html)\b/g;
const LINE_REF = /\d+\s*[~-]\s*\d+\s*(?:번째\s*)?줄|\d+\s*번째\s*줄|\d+\s*줄/g;
const LEADING_PARTICLE = /^(의|에서|에|를|을|은|는|이|가)\s+/;

/** 유형 태그와 중복 공백을 뺀다. 사용자가 직접 쓴 제목(제목: 필드)은 자르지 않는다. */
export function cleanTitle(text: string): string {
  const title = text.replace(TYPE_TAG_ALL, "").replace(/\s+/g, " ").trim();
  return title === "" ? UNTITLED : title;
}

// 절이 끝나는 연결 어미 → 끝맺음 ("로드되면서 …" → "로드됨", "없어 …" → "없음")
// "~하고/~되고"는 조건이 이어지는 경우가 많아("추가하고 입력하지 않을 경우") 끊지 않는다.
const CLAUSE_END = /(하면서|해서|되면서|되어서|돼서|없어서|없어|있어서|않아서|않아)(?=\s)|(?=,\s)/g;
const CLAUSE_MIN = 8;

function closeClause(ending: string | undefined): string {
  if (!ending) return ""; // 쉼표 앞에서 끊음
  if (/^[하해]/.test(ending)) return "함";
  if (/^[되돼]/.test(ending)) return "됨";
  if (ending.startsWith("없")) return "없음";
  if (ending.startsWith("있")) return "있음";
  return "않음";
}

/**
 * 자동 제목: 길면 "…"로 자르지 않고, 60자 안에서 끝나는 마지막 절까지만 쓰고 끝맺는다.
 * 끊을 절이 없으면 문장을 그대로 둔다 (너무 길면 단어 경계에서).
 */
export function makeTitle(text: string): string {
  const title = cleanTitle(text);
  const length = (s: string) => Array.from(s).length;
  if (length(title) <= TITLE_MAX) return title;

  let best: string | null = null;
  for (const match of title.matchAll(CLAUSE_END)) {
    const candidate = `${title.slice(0, match.index)}${closeClause(match[1])}`.trim();
    if (length(candidate) > TITLE_MAX) break;
    if (length(candidate) >= CLAUSE_MIN) best = candidate;
  }
  if (best) return best;
  if (length(title) <= TITLE_HARD_MAX) return title;
  const cut = Array.from(title).slice(0, TITLE_HARD_MAX).join("");
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : undefined).trim();
}

/** "[영역] 요약". 요약이 이미 같은 말로 시작하면("BO 쿠폰 …") 그 말은 뺀다. */
export function withScope(scope: string | null | undefined, title: string): string {
  if (!scope || title === UNTITLED) return title;
  const escaped = scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "BO 쿠폰 …" → "쿠폰 …", "fit/fitBrandSearch …" → "fitBrandSearch …"
  const rest = title.replace(new RegExp(`^/?${escaped}(?:\\s+|/|$)`, "i"), "").trim();
  return makeTitle(`[${scope}] ${rest || title}`);
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

// 끝맺음 정리: 추측·존댓말 어미를 명사형으로 ("설정된 것으로 보임" → "설정됨", "출력됩니다" → "출력됨")
const HEDGE_END = /\s*(?:것|거)\s*(?:으로\s*보\S*|같\S*)$/;
const ADNOMINAL_END: [RegExp, string][] = [
  [/하는$/, "함"],
  [/되는$/, "됨"],
  [/있는$/, "있음"],
  [/없는$/, "없음"],
  [/된$/, "됨"],
  [/한$/, "함"],
  [/나을$/, "나음"],
  [/좋을$/, "좋음"],
  [/할$/, "함"],
  [/될$/, "됨"],
];
const POLITE_END: [RegExp, string][] = [
  [/됩니다$|돼요$|되요$/, "됨"],
  [/합니다$|해요$/, "함"],
  [/있습니다$|있어요$/, "있음"],
  [/없습니다$|없어요$/, "없음"],
  [/않습니다$|않아요$|않아$/, "않음"],
  [/입니다$|이에요$|예요$/, ""],
];
const LEADING_FILLER = /^(?:단순히|또한|그리고|현재|혹시|근데|그런데)\s+/;
/** 제목으로 쓰지 않을 인사·전달 문장 */
const META_SENTENCE = /올려\s*봅니다|공유\s*드|전달\s*드|확인\s*부탁|안녕하세요|감사합니다|아닌\s*것\s*같/;
const URL_TEXT = /https?:\/\/\S+/g;
const BRANCH_TEXT = /(?<![\w/])(?:feature|bugfix|hotfix|release|fix|refactor)\/[\w.\-#/]+/g;

/** 문장 경계: 마침표 등 뒤 공백, "->"/"=>"/"→", "**" */
const SENTENCE_BREAK = /(?<=[.!?])\s+|\s*(?:->|=>|→)\s*|\s*\*\*\s*/;
/** 나열 경계: "캐싱하지 않음/ 쓰로틀링 …"의 "/ " (경로의 "/"는 뒤에 공백이 없어 해당 안 됨) */
const LIST_BREAK = /\s*\/\s+/;

/** 요약 문장을 제목답게 다듬는다: 첫 문장·첫 항목만, 괄호 부연·군더더기 제거, 명사형 끝맺음. */
export function polishSummary(text: string): string {
  const firstSentence = text.split(SENTENCE_BREAK)[0] ?? "";
  let s = (firstSentence.split(LIST_BREAK)[0] ?? "")
    .replace(/\s*\([^()]*\)/g, "")
    .replace(/(?:^|(?<=\s))\/(?:[\w-]+\/)*([\w-]+)\s*(?=페이지)/g, "$1 ") // "/fit/fits 페이지" → "fits 페이지"
    .replace(/(화면|페이지|UI|영역|부분|탭|팝업|모달|버튼|컴포넌트)\s?인데\s+/g, "$1에서 ") // "미리보기 화면인데 …" → "미리보기 화면에서 …"
    .replace(/\s?인데\s+/g, ", ")
    .replace(/(?:아래|다음)와\s*같이\s+|이렇게\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_FILLER, "")
    .replace(/[.!?~…]+$/, "")
    .trim();

  // "~있는데 …" 처럼 이어지는 문장은 앞 절만 ("가질 수 있는데 …" → "가질 수 있음")
  const clause = s.match(/^(.{10,}?\S는)데\s/);
  if (clause?.[1]) s = clause[1];

  if (HEDGE_END.test(s)) s = s.replace(HEDGE_END, "");
  const adnominal = ADNOMINAL_END.find(([pattern]) => pattern.test(s));
  if (adnominal) s = s.replace(adnominal[0], adnominal[1]);
  const polite = POLITE_END.find(([pattern]) => pattern.test(s));
  if (polite) s = s.replace(polite[0], polite[1]);

  // "ssoToken 의" → "ssoToken의": 영문·숫자 뒤에 띄어 쓴 조사를 붙인다
  return s.replace(/([A-Za-z0-9)\]])\s+(의|에서|에|를|을|은|는|이|가|와|과|로|으로)(?=\s|,|$)/g, "$1$2").trim();
}

/** 주 내용 줄에서 파일 경로·줄 번호·링크·브랜치를 걷어내고 다듬은 요약 문장. */
function summaryOf(line: string): string {
  if (META_SENTENCE.test(line) || /^[^:：]{1,15}[:：]$/.test(line.trim())) return ""; // 인사·전달 문장, 내용 없는 라벨
  const stripped = line
    .replace(URL_TEXT, " ")
    .replace(BRANCH_TEXT, " ")
    .replace(FILE_PATH, " ")
    .replace(LINE_REF, " ")
    .replace(TYPE_TAG_ALL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_PARTICLE, "")
    .trim();
  return polishSummary(stripped);
}

/**
 * 제목 요약: 이슈 사항/이슈/현상 같은 주 섹션의 첫 문장, 없으면 본문 첫 문장을 다듬는다.
 * 쓸 문장이 없으면 파일명. ("[영역] " 접두어는 buildIssue에서 붙인다)
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
    const section = [first, ...(end === -1 ? rest : rest.slice(0, end))].filter((line) => line !== "");
    // 주 섹션이 비어 있으면(빈 "🐞 현상" 제목 등) 본문 전체에서 찾는다
    if (section.length > 0) primary = section;
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

  return makeTitle(summary || (file ? basename(file) : ""));
}
