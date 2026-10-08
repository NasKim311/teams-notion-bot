import { describe, expect, it } from "vitest";
import { isAuthorized } from "../../src/http/auth";

const bearer = (password: string) => `Bearer ${encodeURIComponent(password)}`;

describe("isAuthorized", () => {
  it("비밀번호가 일치하면 true (한글 포함)", async () => {
    expect(await isAuthorized(bearer("비밀번호!123"), "비밀번호!123")).toBe(true);
  });

  it.each<[string, string | null]>([
    ["다른 비밀번호", bearer("wrong")],
    ["헤더 없음", null],
    ["Bearer 없음", "비밀번호!123"],
    ["값 없음", "Bearer "],
    ["잘못된 퍼센트 인코딩", "Bearer %E0%A4%A"],
  ])("거부: %s", async (_label, header) => {
    expect(await isAuthorized(header, "비밀번호!123")).toBe(false);
  });

  it("서버 비밀번호가 비어 있으면 항상 거부", async () => {
    expect(await isAuthorized(bearer(""), "")).toBe(false);
    expect(await isAuthorized(bearer("x"), undefined)).toBe(false);
  });
});
