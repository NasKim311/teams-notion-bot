// 팀에서 쓰는 이슈 양식의 섹션 라벨과 코드 줄을 판별하는 순수 함수.
//   이슈 사항 : ...      (콜론 라벨 — 알려진 라벨만)
//   [ 이슈 ] / [표시되는 내용]   (대괄호 라벨 — 어떤 이름이든)
//   이슈 1) ...          (번호 라벨)

const COLON_LABELS = [
  "이슈 사항",
  "이슈 현상",
  "이슈 원인",
  "이슈 발생 원인",
  "이슈 해결",
  "이슈",
  "현상",
  "원인",
  "기대 동작",
  "처리 상황",
  "관련 추가 이슈",
  "해결 방법",
  "해결",
  "경로",
  "위치",
  "문제점",
  "개선",
  "우려",
  "재현",
  "재현 방법",
  "작업 브랜치명",
  "브랜치명",
  "Merge Request",
  "참고",
  "관련 파일",
  // 본문 고정 틀(structure.ts)의 섹션 이름 — Notion에서 다시 읽을 때와 팀 공유 양식에서 인식
  "처리·해결",
  "참고(이미지 등 참고할만한 자료)",
];
const COLON_LABEL_KEYS = new Set(COLON_LABELS.map((label) => compact(label)));

/** 제목/요약의 주 내용으로 쓸 섹션 */
export const PRIMARY_LABELS = new Set(["이슈 사항", "이슈", "이슈 현상", "현상", "문제점"].map(compact));

const TYPE_TAGS = new Set(["버그", "개선", "운영"]);
// 대괄호 라벨은 줄에 혼자 있을 때만 인정 ("[긴급] 결제 오류" 같은 말머리는 섹션이 아님).
// 길이 30: 본문 틀의 "📎 참고(이미지 등 참고할만한 자료)"(UTF-16 21자)도 라벨로 읽어야 한다.
const BRACKET_LINE = /^\[\s*([^\]]{1,30}?)\s*\]$/;
const COLON_LINE = /^([^:：]{1,15}?)\s*[:：]\s*(.*)$/;
/** 팀 공유 양식의 제목을 콜론 없이 혼자 쓴 줄: "🐞 현상", "📂 관련 파일" (이모지로 시작할 때만. "현상"만 쓴 줄은 내용일 수 있음) */
const EMOJI_HEADING_LINE = /^\p{Extended_Pictographic}️?\s*([^:：]{1,25})$/u;
const NUMBERED_LINE = /^이슈\s*(\d{1,2})\s*\)(?:\s+(.*))?$/;

export interface SectionLabel {
  label: string;
  rest: string;
  /** "이슈 N)" 형태면 N */
  number?: number;
}

/** 비교용 키: 글자·숫자만 남긴다 ("🐞 현상" → "현상", "처리·해결" → "처리해결") */
function compact(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

export function labelKey(label: string): string {
  return compact(label);
}

/** 줄이 섹션 라벨이면 라벨과 같은 줄의 나머지 내용을 돌려준다. */
export function matchSectionLabel(line: string): SectionLabel | null {
  const text = line.trim();

  const numbered = text.match(NUMBERED_LINE);
  if (numbered?.[1])
    return { label: `이슈 ${numbered[1]}`, rest: numbered[2]?.trim() ?? "", number: Number(numbered[1]) };

  const bracket = text.match(BRACKET_LINE);
  if (bracket?.[1] && !TYPE_TAGS.has(bracket[1].trim())) {
    return { label: bracket[1].trim(), rest: "" };
  }

  const colon = text.match(COLON_LINE);
  if (colon?.[1] && COLON_LABEL_KEYS.has(compact(colon[1]))) {
    return { label: colon[1].trim(), rest: colon[2]?.trim() ?? "" };
  }

  const emoji = text.match(EMOJI_HEADING_LINE);
  if (emoji?.[1] && COLON_LABEL_KEYS.has(compact(emoji[1]))) return { label: text, rest: "" };
  return null;
}

const CODE_START =
  /^(const|let|var|if|else|for|while|return|function|import|export|await|async|try|catch|switch|case|class|interface|type|new)\b/;
const HANGUL = /[가-힣]/;

/** 코드로 보이는 줄인지 (복사된 코드 조각을 코드 블록으로 묶기 위함). */
export function isCodeLine(line: string): boolean {
  const text = line.trim();
  if (text === "") return false;
  if (/^(\/\/|\/\*|\*\/)/.test(text)) return true;
  if (CODE_START.test(text) && /[({=;]|=>/.test(text)) return true;
  if (HANGUL.test(text)) return false;
  if (/^[}\])]+[;,)]*$/.test(text)) return true; // 닫는 괄호만 있는 줄
  if (/[{;]$/.test(text)) return true;
  if (/^[\w$.]+\s*:\s*[{[]/.test(text)) return true; // 객체 속성: state: {
  if (/^[\w$.[\]'"]+\s*=\s*.+;?$/.test(text) && /[(){}[\];]/.test(text)) return true;
  return false;
}
