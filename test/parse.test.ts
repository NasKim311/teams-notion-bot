import { describe, expect, it } from "vitest";
import { classify, detectHeader, makeTitle, normalizeText, parsePastedText } from "../src/parse";

const NBSP = String.fromCharCode(0xa0);
const LINK =
  "https://teams.microsoft.com/l/message/19:194ff38d6827458bbbd60f9d1917f425@thread.v2/1791347527995?context=%7B%22contextType%22%3A%22chat%22%7D";

describe("parsePastedText — 추천 양식", () => {
  it("필드 줄로 작성자/링크를 채우고 본문에서는 뺀다", () => {
    const issue = parsePastedText(
      ["[버그] 로그인 버튼 무반응", "작성자: 홍길동(사원) - 유젠", `링크: ${LINK}`, "재현: 로그인 클릭", "기대: 이동"].join("\n"),
    );
    expect(issue).toEqual({
      title: "로그인 버튼 무반응",
      type: "버그",
      author: "홍길동(사원) - 유젠",
      sourceUrl: LINK,
      body: "[버그] 로그인 버튼 무반응\n재현: 로그인 클릭\n기대: 이동",
    });
  });

  it("제목: 필드가 있으면 첫 줄 대신 사용하고 유형 분류에도 반영", () => {
    const issue = parsePastedText("제목: [운영] 관리자 권한 요청\n권한 부탁드립니다");
    expect(issue.title).toBe("관리자 권한 요청");
    expect(issue.type).toBe("운영");
    expect(issue.body).toBe("권한 부탁드립니다");
  });

  it("전각 콜론, 원문/원문 링크 키도 인식", () => {
    expect(parsePastedText(`작성자： 김개발\n원문 링크: ${LINK}\n내용`)).toMatchObject({
      author: "김개발",
      sourceUrl: LINK,
    });
    expect(parsePastedText(`원문: ${LINK}\n내용`).sourceUrl).toBe(LINK);
  });

  it("링크 필드에 Teams가 아닌 http(s) 주소도 허용", () => {
    expect(parsePastedText("링크: https://example.com/a?b=1\n내용").sourceUrl).toBe("https://example.com/a?b=1");
  });
});

describe("parsePastedText — 양식 없이 붙여넣기", () => {
  it("링크만 있는 줄은 원문 링크로 쓰고 본문에서 뺀다", () => {
    const issue = parsePastedText(`화면이 깨져요\n${LINK}`);
    expect(issue.sourceUrl).toBe(LINK);
    expect(issue.body).toBe("화면이 깨져요");
  });

  it("문장 안의 Teams 링크도 원문 링크로 인식 (본문은 유지)", () => {
    const issue = parsePastedText(`여기 참고 ${LINK} 확인 부탁`);
    expect(issue.sourceUrl).toBe(LINK);
    expect(issue.body).toContain(LINK);
  });

  it("Teams 머리글(이름 + 시간)에서 작성자를 추출하고 제목에서는 건너뛴다", () => {
    const issue = parsePastedText("정주영(사원) - 유젠 오후 4:30\n이슈 사항 : FitDetail.tsx 75번째 줄\nssoToken 조건 반대");
    expect(issue.author).toBe("정주영(사원) - 유젠");
    expect(issue.title).toBe("이슈 사항 : FitDetail.tsx 75번째 줄");
    expect(issue.body).toContain("정주영(사원) - 유젠 오후 4:30"); // 대화 맥락은 본문에 유지
  });

  it("작성자 필드가 머리글보다 우선", () => {
    expect(parsePastedText("정주영 오후 4:30\n작성자: 김개발\n내용").author).toBe("김개발");
  });

  it("작성자를 알 수 없으면 기본값", () => {
    expect(parsePastedText("그냥 내용만 있어요").author).toBe("알 수 없음");
  });

  it("앞뒤 공백·CRLF·NBSP를 정리", () => {
    const issue = parsePastedText(`\r\n\r\n  제목입니다${NBSP}${NBSP}끝  \r\n본문\r\n\r\n\r\n\r\n끝줄\r\n`);
    expect(issue.title).toBe("제목입니다 끝");
    expect(issue.body).toBe("제목입니다  끝\n본문\n\n끝줄");
  });

  it("빈 입력", () => {
    expect(parsePastedText("   ")).toEqual({
      title: "(제목 없음)",
      type: "기타",
      author: "알 수 없음",
      sourceUrl: null,
      body: "",
    });
  });
});

describe("detectHeader", () => {
  it.each([
    ["홍길동 오후 4:30", "홍길동"],
    ["홍길동(사원) - 유젠, 2026-10-07 오후 4:30", "홍길동(사원) - 유젠"],
    ["홍길동 2026. 10. 7. 오전 9:05", "홍길동"],
    ["[오후 4:30] 홍길동", "홍길동"],
    ["Hong Gildong 4:30 PM", "Hong Gildong"],
    ["홍길동 어제 오후 2:10", "홍길동"],
  ])("한 줄 머리글: %s", (line, author) => {
    expect(detectHeader([line, "내용"])).toEqual({ author, lineCount: 1 });
  });

  it("이름 줄 + 시간/날짜 줄 (두 줄 머리글)", () => {
    expect(detectHeader(["홍길동(사원) - 유젠", "오후 4:30", "내용"])).toEqual({
      author: "홍길동(사원) - 유젠",
      lineCount: 2,
    });
    expect(detectHeader(["홍길동", "2026-10-07", "내용"])).toEqual({ author: "홍길동", lineCount: 2 });
  });

  it("버전 번호로 끝나는 제목을 작성자로 오인하지 않는다", () => {
    const issue = parsePastedText("로그인 오류 2.1\n상세");
    expect(issue.title).toBe("로그인 오류 2.1");
    expect(issue.author).toBe("알 수 없음");
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
    expect(detectHeader([line, "내용"])).toBeNull();
  });
});

describe("classify", () => {
  it.each([
    ["[버그] 화면이 깨져요", "버그"],
    ["[개선] 에러 메시지 문구 다듬기", "개선"], // 태그가 키워드보다 우선
    ["[운영] 배포 후 에러 로그 확인 부탁", "운영"],
    ["[개선] 정렬 옵션 [운영]", "개선"], // 먼저 나온 태그 기준
    ["저장이 안됨", "버그"],
    ["검색 기능 제안", "개선"],
    ["에러 안내 개선", "버그"], // 키워드끼리는 버그 우선
    ["관리자 권한 요청드립니다", "기타"], // 운영은 태그로만 분류
  ] as const)("%s → %s", (text, expected) => {
    expect(classify(text)).toBe(expected);
  });
});

describe("makeTitle", () => {
  it("첫 줄만 사용하고 유형 태그는 제거", () => {
    expect(makeTitle("[버그] 로그인 실패\n상세 내용")).toBe("로그인 실패");
  });

  it("50자 초과 시 49자 + … 로 자른다 (서로게이트 쌍 보존)", () => {
    expect(makeTitle("가".repeat(60))).toBe("가".repeat(49) + "…");
    expect(makeTitle("🐛".repeat(55))).toBe("🐛".repeat(49) + "…");
    expect(makeTitle("a".repeat(50))).toBe("a".repeat(50));
  });

  it("내용이 없으면 기본 제목", () => {
    expect(makeTitle("")).toBe("(제목 없음)");
    expect(makeTitle("[버그]")).toBe("(제목 없음)");
  });
});

describe("normalizeText", () => {
  it("연속 빈 줄은 하나로", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});
