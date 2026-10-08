import { describe, expect, it } from "vitest";
import { toBlocks } from "../src/blocks";
import { structureBody } from "../src/structure";

const body = (...rows: string[]) => rows.join("\n");

describe("structureBody", () => {
  it("팀 라벨을 표준 섹션 순서로 모은다 (현상 → 기대 동작 → 원인 → 처리·해결)", () => {
    const result = structureBody(
      body("처리 상황 : 전달 완료", "", "이슈 원인 : 조건문 반대", "", "기대 동작 : 에러 Alert", "", "이슈 사항 : 로그인 안 됨"),
    );
    expect(result).toBe(
      body(
        "[ 🐞 현상 ]",
        "로그인 안 됨",
        "",
        "[ 🎯 기대 동작 ]",
        "에러 Alert",
        "",
        "[ 🔍 원인 ]",
        "조건문 반대",
        "",
        "[ 🛠 처리·해결 ]",
        "전달 완료",
      ),
    );
  });

  it("라벨 없는 글은 현상, 없는 섹션은 생략", () => {
    expect(structureBody("화면이 깨져요\n새로고침하면 정상")).toBe("[ 🐞 현상 ]\n화면이 깨져요\n새로고침하면 정상");
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
    expect(result).toBe(body("[ 🐞 현상 ]", "정렬 초기화", "", "[ 🛠 처리·해결 ]", "상태를 부모로 올림"));
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
      body("[ 🐞 현상 ]", "BO 쿠폰 아이콘 없음", "", "[ 📎 참고 ]", "▸ Merge Request", "http://gitlab.example.com/a/-/merge_requests/1 (dev 미머지)"),
    );
  });

  it("세부 라벨(경로·위치·재현)은 현상 안에 '▸ 라벨'로, 모르는 라벨은 참고로", () => {
    const result = structureBody(body("현상 : 흔들림", "재현 방법 : 모바일 접속", "[표시되는 내용]", "빈 쿠폰"));
    expect(result).toBe(
      body("[ 🐞 현상 ]", "흔들림", "", "▸ 재현 방법", "모바일 접속", "", "[ 📎 참고 ]", "▸ 표시되는 내용", "빈 쿠폰"),
    );
  });

  it("코드 줄은 그대로 두어 코드 블록이 된다", () => {
    const blocks = toBlocks(structureBody(body("이슈 사항 : 분기 누락", "if (ok) {", "  run();", "}")));
    expect(blocks.map((b) => b.type)).toEqual(["heading_3", "paragraph", "code"]);
  });

  it("빈 본문은 빈 문자열", () => {
    expect(structureBody("")).toBe("");
  });
});
