import { describe, expect, it } from "vitest";
import { isCodeLine, matchSectionLabel } from "../../src/issue/sections";

describe("matchSectionLabel", () => {
  it.each([
    ["이슈 사항 : 정렬 UI 초기화", "이슈 사항", "정렬 UI 초기화"],
    ["이슈사항: 붙여 쓴 라벨", "이슈사항", "붙여 쓴 라벨"],
    ["기대 동작 : 정상 표시", "기대 동작", "정상 표시"],
    ["처리 상황 : 전달 완료", "처리 상황", "전달 완료"],
    ["해결 방법 :", "해결 방법", ""],
    [
      "Merge Request: http://gitlab.example.com/a/-/merge_requests/1",
      "Merge Request",
      "http://gitlab.example.com/a/-/merge_requests/1",
    ],
    ["[ 이슈 ]", "이슈", ""],
    ["[위치]", "위치", ""],
    ["[표시되는 내용]", "표시되는 내용", ""],
    ["🛠 처리·해결 :", "🛠 처리·해결", ""], // 본문 고정 틀 섹션 (Notion에서 다시 읽을 때)
    ["🐞 현상 : 흔들림", "🐞 현상", "흔들림"],
  ])("%s", (line, label, rest) => {
    expect(matchSectionLabel(line)).toEqual({ label, rest });
  });

  it("번호 라벨", () => {
    expect(matchSectionLabel("이슈 2)")).toEqual({ label: "이슈 2", rest: "", number: 2 });
    expect(matchSectionLabel("이슈 1) BO 쿠폰 아이콘 없음")).toEqual({
      label: "이슈 1",
      rest: "BO 쿠폰 아이콘 없음",
      number: 1,
    });
  });

  it.each([
    ["[버그] 유형 태그는 섹션 아님"],
    ["[테스트] 말머리가 붙은 문장"], // 대괄호 라벨은 줄에 혼자 있어야 함
    ["[ 경로 ] /src/config/api"],
    ["이슈 1)은 디자인 에셋을 요청하겠습니다."], // 조사가 붙으면 라벨 아님
    ["작업 내용: 알려지지 않은 콜론 라벨"],
    ["https://example.com"],
    ["그냥 문장"],
  ])("섹션 아님: %s", (line) => {
    expect(matchSectionLabel(line)).toBeNull();
  });
});

describe("isCodeLine", () => {
  it.each([
    "const isSupported = 'onscrollend' in window;",
    "if (isSupported) {",
    "} else {",
    "};",
    "}",
    "state: {},",
    "backContext.backHistory[key] = {",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 코드 조각을 그대로 담은 테스트 데이터
    "// console.log(`init: ${key}`);",
    "return value;",
  ])("코드: %s", (line) => {
    expect(isCodeLine(line)).toBe(true);
  });

  it.each([
    "useFirst 는 true,false,undefined 값만 가질 수 있음",
    "를 추가하여 분기처리 해주면 됨",
    "if 조건이 반대로 되어 있음", // 한글 문장
    "feature/multilingual_fe_rt",
    "",
    "=>",
  ])("코드 아님: %s", (line) => {
    expect(isCodeLine(line)).toBe(false);
  });
});
