import { describe, expect, it } from "vitest";
import { FORM_PLACEHOLDERS, stripFormPlaceholders } from "../../src/issue/form";

describe("stripFormPlaceholders", () => {
  it.each([
    ["🐞 현상 : 어떤 화면에서 어떤 문제가 생기는지 (재현 방법 포함)", "🐞 현상 :"],
    ["🌐 테스트 URL : 문제가 생기는 화면 주소", "🌐 테스트 URL :"],
    ["🎯 기대 동작 : 원래 어떻게 동작해야 하는지", "🎯 기대 동작 :"],
    ["📂 관련 파일 : 컴포넌트 경로:줄 번호 (예: src/views/fit/FitPage.tsx:75)", "📂 관련 파일 :"],
    ["📎 참고 : 이미지 등 참고할 만한 자료", "📎 참고 :"],
  ])("예시 문구만 있으면 라벨만 남긴다: %s", (line, expected) => {
    expect(stripFormPlaceholders([line])).toEqual([expected]);
  });

  it("예시 문구 뒤에 덧붙인 내용은 남긴다", () => {
    expect(stripFormPlaceholders(["🎯 기대 동작 : 원래 어떻게 동작해야 하는지 → 실제 가격 표시"])).toEqual([
      "🎯 기대 동작 : → 실제 가격 표시",
    ]);
  });

  it("띄어쓰기가 달라도 예시 문구로 본다", () => {
    expect(stripFormPlaceholders(["📂 관련 파일 : 컴포넌트 경로 : 줄 번호(예: src/views/fit/FitPage.tsx:75)"])).toEqual(
      ["📂 관련 파일 :"],
    );
  });

  it.each([["━━━━━━ <이슈 공유 양식> ━━━━━━"], ["━━━━━━ <결과 공유 양식> ━━━━━━"], ["──────────"], ["-----"]])(
    "선으로만 된 구분선은 뺀다: %s",
    (line) => {
      expect(stripFormPlaceholders(["현상 : 깨짐", line, "원인 : 캐시"])).toEqual(["현상 : 깨짐", "원인 : 캐시"]);
    },
  );

  it("예시 문구가 없는 줄은 그대로 둔다", () => {
    const lines = ["🐞 현상 : 어떤 화면에서든 가격이 0원", "  if (a) {", "a -- b", "<이슈 공유 양식>"];
    expect(stripFormPlaceholders(lines)).toEqual(lines);
  });

  it("예시 문구는 비어 있지 않다", () => {
    expect(FORM_PLACEHOLDERS.every((text) => text.trim() !== "")).toBe(true);
  });
});
