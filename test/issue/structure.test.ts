import { describe, expect, it } from "vitest";
import { structureBody } from "../../src/issue/structure";
import { toBlocks } from "../../src/notion/blocks";

const body = (...rows: string[]) => rows.join("\n");

/** 기대 결과: 여섯 섹션 제목은 항상 있고, 내용은 있는 것만 */
function frame(content: {
  symptom?: string;
  testUrl?: string;
  expected?: string;
  cause?: string;
  fix?: string;
  note?: string;
}): string {
  const sections: [string, string | undefined][] = [
    ["🐞 현상", content.symptom],
    ["🌐 테스트 URL", content.testUrl],
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

  it("팀 공유 양식: 관련 파일 줄은 컬럼에 있으므로 본문에서 빼고, 콜론 없는 제목도 섹션으로", () => {
    const result = structureBody(
      body(
        "🐞 현상 : 총 개수가 다르게 표시됨",
        "🌐 테스트 URL : https://dev-m.example.com/fit/fits",
        "🔍 원인",
        "length 사용",
        "🛠 처리·해결 :",
        "🎯 기대 동작 : total로 표시",
        "📂 관련 파일 : src/views/fit/FitPage.tsx:75",
        "src/views/fit/FitList.tsx 120번째 줄",
        "📎 참고 : 첨부 이미지",
      ),
    );
    expect(result).toBe(
      frame({
        symptom: "총 개수가 다르게 표시됨",
        testUrl: "https://dev-m.example.com/fit/fits",
        cause: "length 사용",
        expected: "total로 표시",
        note: "첨부 이미지",
      }),
    );
  });

  it.each([
    ["🌐 테스트 URL", "🌐 테스트 URL"],
    ["테스트 경로 :", "테스트 경로 :"],
    ["테스트URL:", "테스트URL:"],
  ])("테스트 URL 라벨(%s) 아래 주소는 테스트 URL 섹션으로, 여러 개면 모두", (label) => {
    const result = structureBody(
      body("현상 : 깨짐", label, "https://dev.example.com/a", "https://stg.example.com/a", "원인 : 캐시"),
    );
    expect(result).toBe(
      frame({ symptom: "깨짐", testUrl: "https://dev.example.com/a\nhttps://stg.example.com/a", cause: "캐시" }),
    );
    expect(structureBody(result)).toBe(result);
  });

  it("관련 파일 아래 파일이 아닌 설명은 참고로", () => {
    const result = structureBody(body("현상 : 깨짐", "📂 관련 파일 :", "src/a/B.tsx:75", "공통 컴포넌트도 확인 필요"));
    expect(result).toBe(frame({ symptom: "깨짐", note: "▸ 📂 관련 파일\n공통 컴포넌트도 확인 필요" }));
  });

  it("새 참고 제목은 Notion 소제목이 된다", () => {
    const blocks = toBlocks(structureBody("화면이 깨져요"));
    expect(blocks.at(-1)).toMatchObject({ type: "heading_3" });
  });
});
