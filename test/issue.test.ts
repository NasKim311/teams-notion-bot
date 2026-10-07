import { describe, expect, it } from "vitest";
import { validateIssue } from "../src/issue";

const valid = {
  title: "로그인 버튼 무반응",
  type: "버그",
  author: "홍길동",
  sourceUrl: "https://teams.microsoft.com/l/message/19:abc@thread.v2/1",
  body: "본문",
};

describe("validateIssue", () => {
  it("정상 입력은 공백을 정리해 통과", () => {
    expect(validateIssue({ ...valid, title: "  로그인   버튼 ", author: " 홍길동 ", body: " 본문 \n" })).toEqual({
      ok: true,
      issue: { ...valid, title: "로그인 버튼" },
    });
  });

  it("빈 원문 링크·작성자는 null·기본값", () => {
    expect(validateIssue({ ...valid, sourceUrl: "  ", author: "" })).toMatchObject({
      ok: true,
      issue: { sourceUrl: null, author: "알 수 없음" },
    });
    expect(validateIssue({ ...valid, sourceUrl: null })).toMatchObject({ ok: true, issue: { sourceUrl: null } });
  });

  it("운영 유형 허용", () => {
    expect(validateIssue({ ...valid, type: "운영" }).ok).toBe(true);
  });

  it.each<[string, unknown]>([
    ["객체 아님", "text"],
    ["null", null],
    ["제목 없음", { ...valid, title: "   " }],
    ["제목 201자", { ...valid, title: "가".repeat(201) }],
    ["모르는 유형", { ...valid, type: "질문" }],
    ["작성자 101자", { ...valid, author: "a".repeat(101) }],
    ["http(s)가 아닌 링크", { ...valid, sourceUrl: "javascript:alert(1)" }],
    ["URL 아님", { ...valid, sourceUrl: "그냥 텍스트" }],
    ["본문 초과", { ...valid, body: "a".repeat(200_001) }],
  ])("거부: %s", (_label, input) => {
    const result = validateIssue(input);
    expect(result.ok).toBe(false);
  });

  it("오류 메시지를 돌려준다", () => {
    expect(validateIssue({ ...valid, sourceUrl: "ftp://x" })).toEqual({
      ok: false,
      error: "원문 링크는 http(s) 주소여야 합니다.",
    });
  });
});
