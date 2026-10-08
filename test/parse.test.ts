import { describe, expect, it } from "vitest";
import {
  classify,
  makeIssueTitle,
  makeTitle,
  matchHeaderAt,
  normalizeText,
  parseIssues,
  parsePastedText,
  personName,
  rewriteHeaders,
  splitIssueLines,
  suggestStatusKind,
} from "../src/parse";

const NBSP = String.fromCharCode(0xa0);
const LINK =
  "https://teams.microsoft.com/l/message/19:194ff38d6827458bbbd60f9d1917f425@thread.v2/1791347527995?context=%7B%22contextType%22%3A%22chat%22%7D";

const lines = (...rows: string[]) => rows;

describe("parsePastedText — 추천 양식", () => {
  it("필드 줄로 작성자를 채우고 작성자/링크 줄은 본문에서 뺀다", () => {
    const issue = parsePastedText(
      ["[버그] 로그인 버튼 무반응", "작성자: 홍길동(사원) - 회사", `링크: ${LINK}`, "재현: 로그인 클릭", "기대: 이동"].join("\n"),
    );
    expect(issue).toEqual({
      title: "로그인 버튼 무반응",
      type: "버그",
      author: "홍길동",
      platform: null,
      body: "[버그] 로그인 버튼 무반응\n재현: 로그인 클릭\n기대: 이동",
      workItemUrl: null,
      mrUrl: null,
      branch: "",
      files: "",
      areas: [],
    });
  });

  it("제목: 필드가 있으면 그대로 쓰고 유형 분류에도 반영", () => {
    const issue = parsePastedText("제목: [운영] 관리자 권한 요청\n권한 부탁드립니다");
    expect(issue.title).toBe("관리자 권한 요청");
    expect(issue.type).toBe("운영");
    expect(issue.body).toBe("권한 부탁드립니다");
  });

  it("전각 콜론, 원문/원문 링크/링크 줄은 저장하지 않고 본문에서 뺀다", () => {
    expect(parsePastedText(`작성자： 김개발\n원문 링크: ${LINK}\n내용`)).toMatchObject({ author: "김개발", body: "내용" });
    expect(parsePastedText(`원문: ${LINK}\n내용`).body).toBe("내용");
    expect(parsePastedText("링크: https://example.com/a?b=1\n내용").body).toBe("내용");
  });
});

describe("parsePastedText — Teams 복사 형식", () => {
  it("두 줄 머리글(이름 + 시간)에서 작성자를 뽑고 본문엔 한 줄로 남긴다", () => {
    const issue = parsePastedText(
      lines(
        "홍길동(사원) - 회사",
        "오후 4:30",
        "편집됨",
        "",
        "이슈 사항 : src/views/shop/pages/ShopDetail.tsx 75번째 줄",
        "로그인 토큰 조건문이 반대로 설정된 것으로 보임",
        "",
        "기대 동작 : 토큰이 없을 때 에러 Alert",
      ).join("\n"),
    );
    expect(issue.author).toBe("홍길동");
    expect(issue.title).toBe("ShopDetail.tsx: 로그인 토큰 조건문이 반대로 설정된 것으로 보임");
    expect(issue.type).toBe("버그");
    expect(issue.body.split("\n")[0]).toBe("— 홍길동(사원) - 회사 · 오후 4:30");
  });

  it("시간 줄이 이름보다 먼저 와도 인식", () => {
    expect(parsePastedText("오후 5:20\n김개발(사원) - 회사\n예약은 제가 확인할게요").author).toBe("김개발");
  });

  it("전달된 메시지는 연달아 붙은 머리글 중 마지막(원작성자)을 작성자로", () => {
    const issue = parsePastedText(
      lines("박팀장(담당) - 회사", "어제 오전 8:43", "김개발(담당) - 회사", "2026-09-30 오후 1:25", "", "BO 쿠폰 화면 아이콘 없음").join("\n"),
    );
    expect(issue.author).toBe("김개발");
    expect(issue.body).toBe(
      "— 박팀장(담당) - 회사 · 어제 오전 8:43\n— 김개발(담당) - 회사 · 2026-09-30 오후 1:25\n\nBO 쿠폰 화면 아이콘 없음",
    );
  });

  it("본문 중간의 다른 사람 머리글도 한 줄로 바꾸지만 작성자는 첫 머리글", () => {
    const issue = parsePastedText(
      lines("홍길동(사원) - 회사", "오후 1:32", "이슈 사항 : 정렬 UI 초기화", "김개발(사원) - 회사", "오후 1:57", "어떻게 파악하셨나요?").join("\n"),
    );
    expect(issue.author).toBe("홍길동");
    expect(issue.body).toContain("— 김개발(사원) - 회사 · 오후 1:57");
  });

  it("Teams 링크만 있는 줄은 본문에서 뺀다 / 문장 속 링크는 본문 유지", () => {
    expect(parsePastedText(`화면이 깨져요\n${LINK}`).body).toBe("화면이 깨져요");
    expect(parsePastedText(`여기 참고 ${LINK} 확인 부탁`).body).toContain(LINK);
  });

  it("personName: Teams 표시 이름에서 이름만, 쉼표 제거", () => {
    expect(personName("정주영(사원) - 유젠")).toBe("정주영");
    expect(personName("홍길동 - 회사")).toBe("홍길동");
    expect(personName("Kim, Dev")).toBe("Kim Dev");
    expect(personName("서지연")).toBe("서지연");
  });

  it("작성자 필드가 머리글보다 우선, 아무것도 없으면 기본값", () => {
    expect(parsePastedText("홍길동 오후 4:30\n작성자: 김개발\n내용").author).toBe("김개발");
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
      platform: null,
      body: "",
      workItemUrl: null,
      mrUrl: null,
      branch: "",
      files: "",
      areas: [],
    });
  });

  it("개발 정보도 함께 추출 (일감 기본 주소는 옵션)", () => {
    const text = "이슈 사항 : src/views/fit/pages/A.tsx 75번째 줄\n문제 설명\n처리 상황 : 일감번호 8795 처리 중 삽입된 코드";
    expect(parsePastedText(text, { redmineIssueUrl: "http://redmine.example.com/issues" })).toMatchObject({
      workItemUrl: "http://redmine.example.com/issues/8795",
      files: "src/views/fit/pages/A.tsx:75",
      areas: ["fit"],
    });
    expect(parsePastedText(text).workItemUrl).toBeNull();
  });
});

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
    expect(matchHeaderAt(["홍길동(사원) - 회사", "오후 4:30"], 0, true)).toMatchObject({ author: "홍길동(사원) - 회사" });
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

describe("makeIssueTitle", () => {
  it.each<[string, string[], string]>([
    [
      "이슈 사항 섹션 + 파일 경로 (다음 줄이 요약)",
      ["이슈 사항 : src/views/a/pages/ListPage.tsx 75 번째 줄", "검색결과 총 갯수가 total 이 아닌 length 로 표시됨"],
      "ListPage.tsx: 검색결과 총 갯수가 total 이 아닌 length 로 표시됨",
    ],
    [
      "파일명 한 줄 + 현상 섹션",
      ["view/evt/components/molecule/TabWrapper.tsx", "현상 : 탭 클릭 이동시 순서가 꼬이는 문제"],
      "TabWrapper.tsx: 탭 클릭 이동시 순서가 꼬이는 문제",
    ],
    [
      "파일명 + 줄 번호 + 코드는 건너뛰고 설명",
      ["src/hooks/useBack.ts", "103~119 줄", "if (useFirst === undefined) {", "useFirst 값 분기가 중복됨"],
      "useBack.ts: useFirst 값 분기가 중복됨",
    ],
    [
      "경로 뒤 조사 제거",
      ["src/views/brd/Map.tsx 의 PinchZoom 높이가 흔들림"],
      "Map.tsx: PinchZoom 높이가 흔들림",
    ],
    ["대괄호 섹션", ["feature/some-branch", "", "[ 이슈 ]", "다국어 페이지 등급을 잘못 파악함"], "다국어 페이지 등급을 잘못 파악함"],
    ["번호 섹션", ["이슈 1)", "BO 쿠폰 등록 화면 아이콘 없음"], "BO 쿠폰 등록 화면 아이콘 없음"],
    ["머리글 줄은 무시", ["— 홍길동 · 오후 1:00", "그냥 첫 문장"], "그냥 첫 문장"],
    ["=> 제안 줄은 요약에서 제외", ["이슈 사항 : Foo.tsx", "=> 이렇게 고치면 됨", "실제 문제 설명"], "Foo.tsx: 실제 문제 설명"],
  ])("%s", (_label, input, expected) => {
    expect(makeIssueTitle(input)).toBe(expected);
  });

  it("요약이 없으면 파일명, 둘 다 없으면 기본 제목", () => {
    expect(makeIssueTitle(["src/a/OnlyFile.tsx"])).toBe("OnlyFile.tsx");
    expect(makeIssueTitle([])).toBe("(제목 없음)");
  });
});

describe("classify", () => {
  it.each([
    ["[버그] 화면이 깨져요", "버그"],
    ["[개선] 에러 메시지 문구 다듬기", "개선"], // 태그가 신호보다 우선
    ["[개선] 정렬 옵션 [운영]", "개선"], // 먼저 나온 태그 기준
    ["기대 동작 : 정상 표시", "버그"],
    ["이슈 원인 : 상태 초기화", "버그"],
    ["저장이 안됨", "버그"],
    ["현범님께 할당된 일감 공유드립니다", "운영"],
    ["공통 컴포넌트로 빼면 더 나을 것 같습니다", "개선"],
    ["가독성을 위해 리팩토링 제안", "개선"],
    ["에러 안내 개선", "버그"], // 버그 > 개선
    ["점심 메뉴 추천", "기타"],
  ] as const)("%s → %s", (text, expected) => {
    expect(classify(text)).toBe(expected);
  });
});

describe("makeTitle / normalizeText", () => {
  it("50자 초과 시 49자 + … 로 자른다 (서로게이트 쌍 보존)", () => {
    expect(makeTitle("가".repeat(60))).toBe("가".repeat(49) + "…");
    expect(makeTitle("🐛".repeat(55))).toBe("🐛".repeat(49) + "…");
    expect(makeTitle("a".repeat(50))).toBe("a".repeat(50));
    expect(makeTitle("[버그]")).toBe("(제목 없음)");
  });

  it("연속 빈 줄은 하나로", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("splitIssueLines / parseIssues", () => {
  it("번호 라벨: 같은 번호끼리 모으고 앞부분은 공통 맥락", () => {
    const text = [
      "김개발(담당) - 회사",
      "2026-09-30 오후 1:25",
      "이슈 1)",
      "BO 쿠폰 아이콘 없음",
      "이슈 2)",
      "미리보기에 빈 항목 출력",
      "박팀장(담당) - 회사",
      "2026-09-30 오후 2:15",
      "티켓 생성했습니다.",
      "이슈 1)",
      "http://redmine.example.com/issues/12351",
      "이슈 2)",
      "http://redmine.example.com/issues/12352",
    ].join("\n");

    const { issues, splittable } = parseIssues(text);
    expect(splittable).toBe(true);
    expect(issues.map((i) => i.title)).toEqual(["BO 쿠폰 아이콘 없음", "미리보기에 빈 항목 출력"]);
    expect(issues.map((i) => i.workItemUrl)).toEqual([
      "http://redmine.example.com/issues/12351",
      "http://redmine.example.com/issues/12352",
    ]);
    expect(issues.every((i) => i.author === "김개발")).toBe(true);
    expect(issues[0]!.platform).toBe("BO");
    expect(issues[0]!.body.startsWith("— 김개발(담당) - 회사 · 2026-09-30 오후 1:25")).toBe(true);
  });

  it("[ 이슈 ] 주 섹션이 반복되면 등장할 때마다 나눈다", () => {
    const text = ["feature/multi_rt", "", "[ 이슈 ]", "첫 번째 문제", "[ 개선 ]", "고침", "", "[ 이슈 ]", "두 번째 문제"].join("\n");
    const { issues } = parseIssues(text);
    expect(issues.map((i) => i.title)).toEqual(["첫 번째 문제", "두 번째 문제"]);
    expect(issues.every((i) => i.branch === "feature/multi_rt")).toBe(true);
    expect(issues[0]!.body).toContain("고침");
    expect(issues[1]!.body).not.toContain("고침");
  });

  it("split: false면 하나로", () => {
    const text = "이슈 1)\nA 문제\n이슈 2)\nB 문제";
    expect(parseIssues(text, { split: false })).toMatchObject({ splittable: true, issues: [{ title: "A 문제" }] });
  });

  it("나눌 수 없으면 하나, splittable false", () => {
    expect(parseIssues("이슈 사항 : 하나뿐\n기대 동작 : 정상")).toMatchObject({ splittable: false, issues: [{ title: "하나뿐" }] });
    expect(splitIssueLines(["이슈 1)", "하나만 번호"])).toBeNull();
  });

  it("제목: 필드가 있으면 나누지 않는다", () => {
    expect(parseIssues("제목: 묶음 이슈\n이슈 1)\nA\n이슈 2)\nB")).toMatchObject({ splittable: false, issues: [{ title: "묶음 이슈" }] });
  });

  it("'이슈 1)은 ...' 같은 문장은 라벨로 보지 않는다", () => {
    expect(splitIssueLines(["이슈 1)은 디자인 요청하겠습니다.", "이슈 2)는 수정 부탁드려요."])).toBeNull();
  });
});

describe("suggestStatusKind", () => {
  it.each([
    ["#11660 이슈 수정하여 전달드립니다.", "complete"],
    ["Merge Request: http://gitlab.example.com/a/-/merge_requests/12101", "complete"],
    ["이슈 해결: overflow-anchor: none", "complete"],
    ["작업 브랜치명 : feature/a-#1", "inProgress"],
    ["전달주신 이슈 티켓 생성하였습니다.", "inProgress"],
    ["어떻게 파악하셨나요?", null],
  ] as const)("%s → %s", (text, kind) => {
    expect(suggestStatusKind(text)).toBe(kind);
  });
});

describe("회귀: 말머리 대괄호", () => {
  it("이슈 사항 다음 줄의 '[테스트] ...'는 섹션이 아니라 요약으로 쓴다", () => {
    const issue = parsePastedText("이슈 사항 : src/views/e2e/pages/E2eCheck.tsx 12번째 줄\n[테스트] 자동 검증용 이슈\n기대 동작 : 정상");
    expect(issue.title).toBe("E2eCheck.tsx: [테스트] 자동 검증용 이슈");
  });
});
