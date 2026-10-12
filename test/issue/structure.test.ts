import { describe, expect, it } from "vitest";
import { structureBody } from "../../src/issue/structure";
import { toBlocks } from "../../src/notion/blocks";

const body = (...rows: string[]) => rows.join("\n");

/** 기대 결과: 다섯 섹션 제목은 항상 있고, 내용은 있는 것만 */
function frame(content: { symptom?: string; expected?: string; cause?: string; fix?: string; note?: string }): string {
  const sections: [string, string | undefined][] = [
    ["🐞 현상", content.symptom],
    ["🔍 원인", content.cause],
    ["🛠 처리·해결", content.fix],
    ["🎯 기대 동작", content.expected],
    ["📎 참고(이미지 등 참고할만한 자료)", content.note],
  ];
  return sections.map(([title, text]) => (text ? `[ ${title} ]\n${text}` : `[ ${title} ]`)).join("\n\n");
}

describe("structureBody", () => {
  it("팀 라벨을 표준 섹션 순서로 모은다 (현상 → 원인 → 처리·해결 → 기대 동작)", () => {
    const result = structureBody(
      body(
        "처리 상황 : 전달 완료",
        "",
        "이슈 원인 : 조건문 반대",
        "",
        "기대 동작 : 에러 Alert",
        "",
        "이슈 사항 : 로그인 안 됨",
      ),
    );
    expect(result).toBe(
      frame({ symptom: "로그인 안 됨", expected: "에러 Alert", cause: "조건문 반대", fix: "전달 완료" }),
    );
  });

  it("내용이 없는 섹션도 제목은 넣는다", () => {
    expect(structureBody("화면이 깨져요\n새로고침하면 정상")).toBe(
      frame({ symptom: "화면이 깨져요\n새로고침하면 정상" }),
    );
    const blocks = toBlocks(structureBody("화면이 깨져요"));
    expect(blocks.map((b) => b.type)).toEqual([
      "heading_3",
      "paragraph",
      "heading_3",
      "heading_3",
      "heading_3",
      "heading_3",
    ]);
  });

  it("빈 본문이면 섹션 제목만", () => {
    expect(structureBody("")).toBe(frame({}));
  });

  it("머리글과 답글의 라벨 없는 대화는 넣지 않고, 답글 속 라벨은 해당 섹션으로", () => {
    const result = structureBody(
      body(
        "— 홍길동 · 오후 1:32",
        "이슈 사항 : 정렬 초기화",
        "— 김개발 · 오후 1:57",
        "어떻게 파악하셨나요?",
        "— 홍길동 · 오후 2:03",
        "해결 방법 : 상태를 부모로 올림",
      ),
    );
    expect(result).toBe(frame({ symptom: "정렬 초기화", fix: "상태를 부모로 올림" }));
    expect(result).not.toContain("어떻게 파악하셨나요?");
    expect(result).not.toContain("—");
  });

  it("브랜치·MR·레드마인 링크만 있는 줄은 빼고, 설명이 붙은 줄은 참고로", () => {
    const result = structureBody(
      body(
        "작업 브랜치명 :",
        "feature/uzen-event-#11661",
        "이슈 1)",
        "http://redmine.example.com/issues/12351",
        "BO 쿠폰 아이콘 없음",
        "Merge Request :",
        "http://gitlab.example.com/a/-/merge_requests/1 (dev 미머지)",
      ),
    );
    expect(result).toBe(
      frame({
        symptom: "BO 쿠폰 아이콘 없음",
        note: "▸ Merge Request\nhttp://gitlab.example.com/a/-/merge_requests/1 (dev 미머지)",
      }),
    );
  });

  it("세부 라벨(경로·위치·재현)은 현상 안에 '▸ 라벨'로, 모르는 라벨은 참고로", () => {
    const result = structureBody(body("현상 : 흔들림", "재현 방법 : 모바일 접속", "[표시되는 내용]", "빈 쿠폰"));
    expect(result).toBe(frame({ symptom: "흔들림\n\n▸ 재현 방법\n모바일 접속", note: "▸ 표시되는 내용\n빈 쿠폰" }));
  });

  it("코드 줄은 그대로 두어 코드 블록이 된다", () => {
    const blocks = toBlocks(structureBody(body("이슈 사항 : 분기 누락", "if (ok) {", "  run();", "}")));
    expect(blocks.slice(0, 3).map((b) => b.type)).toEqual(["heading_3", "paragraph", "code"]);
  });

  it("이미 틀로 정리된 본문을 다시 정리해도 같다", () => {
    const once = structureBody(body("이슈 원인 : 조건문 반대", "기대 동작 : 에러 Alert"));
    expect(structureBody(once)).toBe(once);
  });

  it("참고 섹션 내용도 다시 정리하면 참고에 그대로 남는다 (긴 참고 제목도 섹션으로 인식)", () => {
    const once = structureBody(body("이슈 사항 : 로그인 안 됨", "", "관련 추가 이슈 : 회원가입도 확인 필요"));
    expect(once).toBe(frame({ symptom: "로그인 안 됨", note: "▸ 관련 추가 이슈\n회원가입도 확인 필요" }));
    expect(structureBody(once)).toBe(once);
  });

  it("새 참고 제목은 Notion 소제목이 된다", () => {
    const blocks = toBlocks(structureBody("화면이 깨져요"));
    expect(blocks.at(-1)).toMatchObject({ type: "heading_3" });
  });
});
