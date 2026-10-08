import { describe, expect, it } from "vitest";
import { matchHeaderAt, rewriteHeaders } from "../../src/issue/header";

describe("matchHeaderAt", () => {
  it.each([
    ["홍길동 오후 4:30", "홍길동", "오후 4:30"],
    ["홍길동(사원) - 회사, 2026-10-07 오후 4:30", "홍길동(사원) - 회사", "2026-10-07 오후 4:30"],
    ["홍길동 2026. 10. 7. 오전 9:05", "홍길동", "2026. 10. 7. 오전 9:05"],
    ["[오후 4:30] 홍길동", "홍길동", "오후 4:30"],
    ["Hong Gildong 4:30 PM", "Hong Gildong", "4:30 PM"],
    ["홍길동 어제 오후 2:10", "홍길동", "어제 오후 2:10"],
  ])("한 줄 머리글: %s", (line, author, stamp) => {
    expect(matchHeaderAt([line, "내용"], 0)).toEqual({ author, stamp, lineCount: 1 });
  });

  it("두 줄 머리글 + 편집됨", () => {
    expect(matchHeaderAt(["홍길동", "2026-10-07", "편집됨", "내용"], 0)).toEqual({
      author: "홍길동",
      stamp: "2026-10-07",
      lineCount: 3,
    });
  });

  it.each([
    ["[버그] 로그인 오후 4:30"], // 태그가 있으면 이름 아님
    ["회의는 오후 3:00에 합시다"], // 시간이 문장 중간
    ["https://example.com 오후 4:30"],
    ["이 문장은 마흔 글자를 훌쩍 넘어가는 아주 긴 첫 줄이라서 이름으로 볼 수 없습니다 오후 4:30"],
    ["시간 없는 첫 줄"],
    ["로그인 오류 2.1"], // 날짜처럼 보이는 버전 번호
    ["홍길동 10/7"], // 한 줄 머리글은 시간이 필요
  ])("머리글 아님: %s", (line) => {
    expect(matchHeaderAt([line, "내용"], 0)).toBeNull();
  });

  it("시간 줄 다음의 일반 문장은 이름으로 보지 않는다", () => {
    expect(matchHeaderAt(["오후 5:20", "예약은 제가 전화해보고 말씀드릴게요"], 0)).toBeNull();
  });

  it("strict(본문 중간)에서는 표시 이름 형태만 인정", () => {
    expect(matchHeaderAt(["홍길동", "오후 4:30"], 0, true)).toBeNull();
    expect(matchHeaderAt(["홍길동(사원) - 회사", "오후 4:30"], 0, true)).toMatchObject({
      author: "홍길동(사원) - 회사",
    });
  });
});

describe("rewriteHeaders", () => {
  it("맨 앞 머리글이 없으면 작성자 없음", () => {
    expect(rewriteHeaders(["내용", "홍길동(사원) - 회사", "오후 1:00"])).toEqual({
      lines: ["내용", "— 홍길동(사원) - 회사 · 오후 1:00"],
      author: undefined,
    });
  });
});
