import { describe, expect, it } from "vitest";
import { NotionError, notionErrorMessage } from "../../src/notion/client";

describe("notionErrorMessage", () => {
  it.each([
    ["unauthorized", "토큰"],
    ["restricted_resource", "권한"],
    ["object_not_found", "찾을 수 없어요"],
    ["validation_error", "속성"],
    ["rate_limited", "너무 많아요"],
    ["conflict_error", "status 409"],
  ])("%s", (code, text) => {
    expect(notionErrorMessage(new NotionError(code === "conflict_error" ? 409 : 400, code))).toContain(text);
  });

  it("NotionError가 아니면 일반 안내", () => {
    expect(notionErrorMessage(new Error("x"))).toContain("잠시 후 다시 시도");
  });
});
