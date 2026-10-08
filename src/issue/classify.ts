import type { IssueType } from "../types";

// 이슈 유형 분류와 기존 이슈 업데이트 시 추천할 상태.

export const TYPE_TAG = /\[(버그|개선|운영)\]/;
export const TYPE_TAG_ALL = /\[(?:버그|개선|운영)\]/g;
// 태그가 없을 때의 신호. 우선순위: 버그 > 운영 > 개선
const BUG_SIGNALS = /버그|에러|오류|안됨|안 됨|기대\s*동작|이슈\s*원인|이슈\s*현상|현상\s*[:：]|문제점|발생/;
const OPS_SIGNALS = /할당|운영팀|운영\s*일감/;
const IMPROVEMENT_SIGNALS = /개선|제안|리팩[토터]링|가독성|나을\s*것|좋을\s*것|주석/;

/** [버그]/[개선]/[운영] 태그 우선, 없으면 신호 단어로 분류한다 (버그 > 운영 > 개선). */
export function classify(text: string): IssueType {
  const tag = text.match(TYPE_TAG)?.[1];
  if (tag === "버그" || tag === "개선" || tag === "운영") return tag;
  if (BUG_SIGNALS.test(text)) return "버그";
  if (OPS_SIGNALS.test(text)) return "운영";
  if (IMPROVEMENT_SIGNALS.test(text)) return "개선";
  return "기타";
}

const COMPLETE_SIGNALS =
  /수정하여\s*전달|수정\s*완료|해결\s*완료|처리\s*완료|배포\s*완료|머지\s*완료|merge_requests\/\d+|이슈\s*해결\s*[:：]/i;
const IN_PROGRESS_SIGNALS = /브랜치\s*(명)?\s*[:：]|작업\s*중|진행\s*중|확인\s*중|티켓\s*생성|일감\s*생성/;

/** 기존 이슈 업데이트 시 추천할 상태 단계. */
export function suggestStatusKind(text: string): "complete" | "inProgress" | null {
  if (COMPLETE_SIGNALS.test(text)) return "complete";
  if (IN_PROGRESS_SIGNALS.test(text)) return "inProgress";
  return null;
}
