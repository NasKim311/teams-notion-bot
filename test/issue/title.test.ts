import { describe, expect, it } from "vitest";
import { parsePastedText } from "../../src/issue/parse";
import { normalizeText } from "../../src/issue/text";
import { makeIssueTitle, makeTitle, polishSummary, withScope } from "../../src/issue/title";

describe("makeIssueTitle", () => {
  it.each<[string, string[], string]>([
    [
      "이슈 사항 섹션 + 파일 경로 (다음 줄이 요약)",
      ["이슈 사항 : src/views/a/pages/ListPage.tsx 75 번째 줄", "검색결과 총 갯수가 total 이 아닌 length 로 표시됨"],
      "검색결과 총 갯수가 total이 아닌 length로 표시됨",
    ],
    [
      "파일명 한 줄 + 현상 섹션",
      ["view/evt/components/molecule/TabWrapper.tsx", "현상 : 탭 클릭 이동시 순서가 꼬이는 문제"],
      "탭 클릭 이동시 순서가 꼬이는 문제",
    ],
    [
      "파일명 + 줄 번호 + 코드는 건너뛰고 설명",
      ["src/hooks/useBack.ts", "103~119 줄", "if (useFirst === undefined) {", "useFirst 값 분기가 중복됨"],
      "useFirst 값 분기가 중복됨",
    ],
    ["경로 뒤 조사 제거", ["src/views/brd/Map.tsx 의 PinchZoom 높이가 흔들림"], "PinchZoom 높이가 흔들림"],
    [
      "대괄호 섹션",
      ["feature/some-branch", "", "[ 이슈 ]", "다국어 페이지 등급을 잘못 파악함"],
      "다국어 페이지 등급을 잘못 파악함",
    ],
    ["번호 섹션", ["이슈 1)", "BO 쿠폰 등록 화면 아이콘 없음"], "BO 쿠폰 등록 화면 아이콘 없음"],
    ["머리글 줄은 무시", ["— 홍길동 · 오후 1:00", "그냥 첫 문장"], "그냥 첫 문장"],
    ["=> 제안 줄은 요약에서 제외", ["이슈 사항 : Foo.tsx", "=> 이렇게 고치면 됨", "실제 문제 설명"], "실제 문제 설명"],
    [
      "인사·전달 문장과 내용 없는 라벨은 건너뜀",
      ["프론트 이슈는 아닌것 같지만 올려봅니다..", "이슈 2 :", "쿠폰 목록이 비어 있음"],
      "쿠폰 목록이 비어 있음",
    ],
    [
      "현상 섹션이 비어 있으면 본문 전체에서",
      ["[ 🐞 현상 ]", "[ 🎯 기대 동작 ]", "[ 🔍 원인 ]", "스크롤 보정 오류"],
      "스크롤 보정 오류",
    ],
    [
      "브랜치·링크만 있는 줄은 건너뜀",
      ["브랜치명 : feature/a-#1", "Merge Request : http://g/-/merge_requests/1", "이슈 원인 :", "스크롤 보정"],
      "스크롤 보정",
    ],
  ])("%s", (_label, input, expected) => {
    expect(makeIssueTitle(input)).toBe(expected);
  });

  it("요약이 없으면 파일명, 둘 다 없으면 기본 제목", () => {
    expect(makeIssueTitle(["src/a/OnlyFile.tsx"])).toBe("OnlyFile.tsx");
    expect(makeIssueTitle([])).toBe("(제목 없음)");
  });
});

describe("polishSummary", () => {
  it.each([
    ["ssoToken 의 조건문이 반대로 설정된 것으로 보임", "ssoToken의 조건문이 반대로 설정됨"],
    ["모바일에서만 흔들림 (웹에서는 재현 안됨)", "모바일에서만 흔들림"],
    ["바코드쿠폰의 아이콘이 없음 (asset 에 없음) -> 아이콘 추가 필요", "바코드쿠폰의 아이콘이 없음"],
    ["결과를 캐싱하지 않음/ 쓰로틀링 되지 않음", "결과를 캐싱하지 않음"],
    ["빈 항목이 출력됩니다. 실제 등록은 문제 없습니다", "빈 항목이 출력됨"],
    ["단순히 공통 컴포넌트로 빼는 방법이 더 나을 것 같습니다.", "공통 컴포넌트로 빼는 방법이 더 나음"],
    [
      "useFirst 는 true,false,undefined 값만 가질 수 있는데 분기가 중복됨",
      "useFirst는 true,false,undefined 값만 가질 수 있음",
    ],
    ["/fit/fits 페이지 정렬 초기화", "fits 페이지 정렬 초기화"],
    ["쿠폰 미리보기 화면인데 빈 항목 출력", "쿠폰 미리보기 화면에서 빈 항목 출력"],
    ["검색결과 수를 보여주는 UI 인데 length 값이 표시됨", "검색결과 수를 보여주는 UI에서 length 값이 표시됨"],
    ["상품 목록인데 정렬이 안 됨", "상품 목록, 정렬이 안 됨"],
    ["입력하지 않으면 아래와 같이 출력됩니다", "입력하지 않으면 출력됨"],
    ["파라미터를 받고 있지 않아", "파라미터를 받고 있지 않음"],
  ])("%s → %s", (input, expected) => {
    expect(polishSummary(input)).toBe(expected);
  });
});

describe("withScope / makeTitle", () => {
  it("[영역] 접두어, 요약 앞의 같은 말은 뺀다", () => {
    expect(withScope("fit", "검색창 길이 제한 없음")).toBe("[fit] 검색창 길이 제한 없음");
    expect(withScope("BO", "BO 쿠폰 아이콘 없음")).toBe("[BO] 쿠폰 아이콘 없음");
    expect(withScope("fit", "fit/fitBrandSearch의 검색창")).toBe("[fit] fitBrandSearch의 검색창");
    expect(withScope(null, "요약")).toBe("요약");
    expect(withScope("fit", "(제목 없음)")).toBe("(제목 없음)");
  });

  it("60자를 넘으면 '…' 없이 60자 안에서 끝나는 마지막 절까지 쓰고 끝맺는다", () => {
    const long =
      "뒤로가기로 스크롤 위치 복원 이후 위쪽 콘텐츠가 비동기적으로 로드되면서 브라우저가 스크롤을 자동으로 보정하게 되는 문제";
    expect(makeTitle(long)).toBe("뒤로가기로 스크롤 위치 복원 이후 위쪽 콘텐츠가 비동기적으로 로드됨");
    expect(
      makeTitle(`[fit] 검색창에 길이 제한이 없어 414 request uri too large 에러가 발생하면 에러 페이지로 넘어감`),
    ).toBe("[fit] 검색창에 길이 제한이 없음");
  });

  it("'~하고'에서는 끊지 않는다 (조건이 이어지는 문장)", () => {
    const text = "[BO] 쿠폰 미리보기 화면에서 쿠폰정보를 추가하고 title과 desc를 입력하지 않을 경우 빈 항목이 출력됨";
    expect(makeTitle(text)).toBe(text);
  });

  it("끊을 절이 없으면 100자까지 그대로, 넘으면 단어 경계에서 (… 없음)", () => {
    expect(makeTitle("가나다 ".repeat(20).trim())).toBe("가나다 ".repeat(20).trim());
    const title = makeTitle("가나다 ".repeat(40));
    expect(Array.from(title).length).toBeLessThanOrEqual(100);
    expect(title.endsWith("가나다")).toBe(true);
  });
});

describe("makeTitle / normalizeText", () => {
  it("띄어쓰기 없는 100자 초과는 100자에서 자르고 '…'는 붙이지 않는다 (서로게이트 쌍 보존)", () => {
    expect(makeTitle("가".repeat(120))).toBe("가".repeat(100));
    expect(makeTitle("🐛".repeat(120))).toBe("🐛".repeat(100));
    expect(makeTitle("a".repeat(60))).toBe("a".repeat(60));
    expect(makeTitle("[버그]")).toBe("(제목 없음)");
  });

  it("제목: 필드로 직접 쓴 제목은 길어도 자르지 않는다", () => {
    const title = "직접 쓴 제목 ".repeat(10).trim();
    expect(parsePastedText(`제목: ${title}\n본문`).title).toBe(title);
  });

  it("연속 빈 줄은 하나로", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});
