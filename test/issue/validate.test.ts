import { describe, expect, it } from "vitest";
import { validateIssue } from "../../src/issue/validate";

const valid = {
  title: "로그인 버튼 무반응",
  type: "버그",
  author: "홍길동",
  platform: "BO",
  body: "본문",
  workItemUrl: "http://redmine.example.com/issues/1",
  mrUrl: "http://gitlab.example.com/a/-/merge_requests/2",
  branch: "feature/x",
  files: "src/A.tsx:1",
  areas: ["fit"],
};

describe("validateIssue", () => {
  it("정상 입력은 공백을 정리해 통과", () => {
    expect(validateIssue({ ...valid, title: "  로그인   버튼 ", author: " 홍길동 ", body: " 본문 \n" })).toEqual({
      ok: true,
      value: { ...valid, title: "로그인 버튼" },
    });
  });

  it("빈 선택 값은 null/빈 문자열/기본값", () => {
    expect(
      validateIssue({
        ...valid,
        platform: "",
        author: "",
        workItemUrl: "",
        mrUrl: null,
        branch: undefined,
        files: "",
        areas: undefined,
      }),
    ).toMatchObject({
      ok: true,
      value: { platform: null, author: "알 수 없음", workItemUrl: null, mrUrl: null, branch: "", files: "", areas: [] },
    });
  });

  it("영역은 쉼표 문자열도 받고 중복·빈 값 제거", () => {
    expect(validateIssue({ ...valid, areas: " fit, evt,,fit " })).toMatchObject({
      ok: true,
      value: { areas: ["fit", "evt"] },
    });
  });

  it("작성자는 select 옵션이라 쉼표를 공백으로", () => {
    expect(validateIssue({ ...valid, author: "Kim, Dev" })).toMatchObject({ ok: true, value: { author: "Kim Dev" } });
  });

  it("운영 유형 허용", () => {
    expect(validateIssue({ ...valid, type: "운영" }).ok).toBe(true);
  });

  it.each<[string, unknown, string]>([
    ["객체 아님", "text", "요청 형식"],
    ["제목 없음", { ...valid, title: "   " }, "제목을 입력"],
    ["제목 201자", { ...valid, title: "가".repeat(201) }, "200자"],
    ["모르는 유형", { ...valid, type: "질문" }, "유형"],
    ["작성자 101자", { ...valid, author: "a".repeat(101) }, "작성자"],
    ["FO/BO 아닌 값", { ...valid, platform: "XO" }, "FO/BO"],
    ["레드마인 링크 javascript:", { ...valid, workItemUrl: "javascript:alert(1)" }, "레드마인 링크"],
    ["레드마인 링크 URL 아님", { ...valid, workItemUrl: "#1234" }, "레드마인 링크"],
    ["MR ftp", { ...valid, mrUrl: "ftp://x" }, "MR"],
    ["브랜치 2001자", { ...valid, branch: "a".repeat(2001) }, "브랜치"],
    ["영역 11개", { ...valid, areas: Array.from({ length: 11 }, (_, i) => `a${i}`) }, "영역"],
    ["영역 타입 오류", { ...valid, areas: 3 }, "영역"],
    ["본문 초과", { ...valid, body: "a".repeat(200_001) }, "본문"],
  ])("거부: %s", (_label, input, message) => {
    const result = validateIssue(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});
