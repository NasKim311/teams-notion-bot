import { describe, expect, it } from "vitest";
import { FORM_PLACEHOLDERS } from "../../src/issue/form";
import { parsePastedText } from "../../src/issue/parse";
import { TEMPLATE } from "../../src/page/page";

/** 팀에 공지한 <이슈 공유 양식> (2026-10-13) */
const NOTICE = [
  "🐞 현상 : 어떤 화면에서 어떤 문제가 생기는지 (재현 방법 포함)",
  "🌐 테스트 URL : 문제가 생기는 화면 주소",
  "🔍 원인 :",
  "🛠 처리·해결 :",
  "🎯 기대 동작 : 원래 어떻게 동작해야 하는지",
  "📂 관련 파일 : 컴포넌트 경로:줄 번호 (예: src/views/fit/FitPage.tsx:75)",
  "📎 참고 : 이미지 등 참고할 만한 자료",
];

describe("TEMPLATE", () => {
  it("작성자 줄 아래는 팀 공지 양식과 같다", () => {
    expect(TEMPLATE.split("\n")).toEqual(["작성자: 홍길동", ...NOTICE]);
  });

  it("공지 양식의 예시 문구는 모두 등록할 때 빠지는 문구다", () => {
    for (const text of FORM_PLACEHOLDERS) expect(TEMPLATE).toContain(text);
  });

  it("양식을 그대로 등록해도 예시 값이 컬럼에 들어가지 않는다", () => {
    const issue = parsePastedText(TEMPLATE);
    expect(issue.files).toBe("");
    expect(issue.areas).toEqual([]);
    expect(issue.author).toBe("홍길동");
  });
});
