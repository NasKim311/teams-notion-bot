import type { IssueType } from "../types";

// 이슈 유형 분류와 기존 이슈 업데이트 시 추천할 상태.

export const TYPE_TAG = /\[(버그|개선|운영)\]/;
export const TYPE_TAG_ALL = /\[(?:버그|개선|운영)\]/g;
// 태그가 없을 때의 신호. 우선순위: 버그 > 운영 > 개선
const BUG_SIGNALS = /버그|에러|오류|안됨|안 됨|기대\s*동작|이슈\s*원인|이슈\s*현상|현상\s*[:：]|문제점|발생/;
const OPS_SIGNALS = /할당|운영팀|운영\s*일감/;
const IMPROVEMENT_SIGNALS = /개선|제안|리팩[토터]링|가독성|나을\s*것|좋을\s*것|주석/;
/** 제안 말투: "더 나을 것 같습니다", "좋을 것 같음", "적용되어야 할 것 같습니다" (I3) */
const IMPROVEMENT_PHRASES = /(?:나을|좋을)\s*것\s*같|가독성|제안|리팩[토터]링|(?:해야|되어야|돼야)\s*할\s*것\s*같/;
/** 고장을 말하는 단어. "휴먼에러를 막을 수 있을 것 같습니다"의 휴먼에러는 사람 실수라 제외 */
const DEFECT_WORDS = /버그|(?<!휴먼\s?)에러|오류|안\s?[됨돼되]|실패|깨짐/;

/**
 * [버그]/[개선]/[운영] 태그 우선. 없으면 제안 말투이고 고장 단어가 없을 때 개선,
 * 그 외는 신호 단어로 분류한다 (버그 > 운영 > 개선).
 * 팀 양식에는 "기대 동작" 같은 버그 신호 라벨이 항상 있어서 제안 말투를 먼저 본다.
 * 규칙은 실제 등록 이슈로 맞췄다 (test/issue/classify.test.ts "회귀 I3").
 */
export function classify(text: string): IssueType {
  const tag = text.match(TYPE_TAG)?.[1];
  if (tag === "버그" || tag === "개선" || tag === "운영") return tag;
  if (IMPROVEMENT_PHRASES.test(text) && !DEFECT_WORDS.test(text)) return "개선";
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
