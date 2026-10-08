import { describe, expect, it } from "vitest";
import { classify, suggestStatusKind } from "../../src/issue/classify";

describe("classify", () => {
  it.each([
    ["[버그] 화면이 깨져요", "버그"],
    ["[개선] 에러 메시지 문구 다듬기", "개선"], // 태그가 신호보다 우선
    ["[개선] 정렬 옵션 [운영]", "개선"], // 먼저 나온 태그 기준
    ["기대 동작 : 정상 표시", "버그"],
    ["이슈 원인 : 상태 초기화", "버그"],
    ["저장이 안됨", "버그"],
    ["현범님께 할당된 일감 공유드립니다", "운영"],
    ["공통 컴포넌트로 빼면 더 나을 것 같습니다", "개선"],
    ["가독성을 위해 리팩토링 제안", "개선"],
    ["에러 안내 개선", "버그"], // 버그 > 개선
    ["점심 메뉴 추천", "기타"],
  ] as const)("%s → %s", (text, expected) => {
    expect(classify(text)).toBe(expected);
  });
});

describe("suggestStatusKind", () => {
  it.each([
    ["#11660 이슈 수정하여 전달드립니다.", "complete"],
    ["Merge Request: http://gitlab.example.com/a/-/merge_requests/12101", "complete"],
    ["이슈 해결: overflow-anchor: none", "complete"],
    ["작업 브랜치명 : feature/a-#1", "inProgress"],
    ["전달주신 이슈 티켓 생성하였습니다.", "inProgress"],
    ["어떻게 파악하셨나요?", null],
  ] as const)("%s → %s", (text, kind) => {
    expect(suggestStatusKind(text)).toBe(kind);
  });
});
