import { describe, expect, it } from "vitest";
import { headerAuthor, messageKey, messageLines, splitMessages } from "../../src/issue/messages";

const lines = (...rows: string[]) => rows;

describe("splitMessages", () => {
  it("머리글마다 메시지로 나눈다", () => {
    const messages = splitMessages(
      lines("— 홍길동(사원) - 유젠 · 오후 1:32", "정렬 초기화", "", "— 김개발(사원) - 유젠 · 오후 1:57", "확인할게요"),
    );
    expect(messages.map((m) => [m.author, m.content.join("|")])).toEqual([
      ["홍길동(사원) - 유젠", "정렬 초기화|"],
      ["김개발(사원) - 유젠", "확인할게요"],
    ]);
  });

  it("머리글 없이 붙여넣은 글은 작성자 없는 메시지 하나", () => {
    expect(splitMessages(lines("그냥 내용", "둘째 줄"))).toEqual([
      { headers: [], author: null, content: ["그냥 내용", "둘째 줄"] },
    ]);
  });

  it("내용 없이 연달아 붙은 머리글(전달된 메시지)은 한 메시지, 작성자는 마지막 머리글", () => {
    const messages = splitMessages(
      lines(
        "— 박팀장(담당) - 회사 · 어제 오전 8:43",
        "— 김개발(담당) - 회사 · 2026-09-30 오후 1:25",
        "",
        "쿠폰 아이콘 없음",
      ),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.author).toBe("김개발(담당) - 회사");
  });

  it("다시 이어 붙이면 원래 줄과 같다", () => {
    const original = lines("앞부분", "— 홍길동 · 오후 1:00", "내용", "— 김개발 · 오후 2:00", "답글");
    expect(messageLines(splitMessages(original))).toEqual(original);
  });
});

describe("messageKey", () => {
  it("시간 표시가 달라도 작성자·내용이 같으면 같은 기준", () => {
    const [today] = splitMessages(lines("— 홍길동 · 오후 1:32", "정렬 초기화"));
    const [nextDay] = splitMessages(lines("— 홍길동 · 어제 오후 1:32", "정렬 초기화"));
    expect(today && messageKey(today)).toBe(nextDay && messageKey(nextDay));
  });

  it("작성자가 다르면 다른 기준, 내용이 없으면 null", () => {
    const [a] = splitMessages(lines("— 홍길동 · 오후 1:32", "확인"));
    const [b] = splitMessages(lines("— 김개발 · 오후 1:32", "확인"));
    expect(a && messageKey(a)).not.toBe(b && messageKey(b));
    const [empty] = splitMessages(lines("— 홍길동 · 오후 1:32", ""));
    expect(empty && messageKey(empty)).toBeNull();
  });
});

describe("headerAuthor", () => {
  it("머리글 줄에서 작성자만", () => {
    expect(headerAuthor("— 홍길동(사원) - 유젠 · 오후 1:32")).toBe("홍길동(사원) - 유젠");
    expect(headerAuthor("— 홍길동")).toBe("홍길동");
  });
});
