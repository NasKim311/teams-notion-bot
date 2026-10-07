import { describe, expect, it } from "vitest";
import { buildMessageLink, classify, cleanText, makeTitle, parseTeamsMessage } from "../src/parse";
import type { TeamsPayload } from "../src/types";
import fixture from "./fixtures/teams-payload.json";

const withText = (text: string): TeamsPayload => ({ ...fixture, text });

describe("parseTeamsMessage (fixture)", () => {
  it("fixture를 Issue로 변환", () => {
    expect(parseTeamsMessage(fixture)).toEqual({
      title: "로그인 버튼을 눌러도 반응이 없습니다",
      type: "버그",
      body: [
        "[버그] 로그인 버튼을 눌러도 반응이 없습니다",
        "재현: Chrome에서 로그인 페이지 접속 후 버튼 클릭",
        "기대: 대시보드로 이동 & 세션 생성",
      ].join("\n"),
      author: "김개발",
      sourceUrl:
        "https://teams.microsoft.com/l/message/19%3A253b1f341670408fb6fcb9b1ce7d8e2d%40thread.tacv2/1759817123456" +
        "?tenantId=11111111-2222-3333-4444-555555555555&parentMessageId=1759817000000",
    });
  });

  it("from.name이 없으면 기본 작성자", () => {
    expect(parseTeamsMessage({ ...fixture, from: {} }).author).toBe("알 수 없음");
  });
});

describe("cleanText", () => {
  it("멘션을 제거한다 (속성 포함, 여러 개)", () => {
    expect(cleanText('<at id="0">이슈봇</at> 안녕 <at>홍길동</at> 확인 부탁')).toBe("안녕 확인 부탁");
  });

  it("HTML 태그 제거 + 줄바꿈 태그는 개행으로", () => {
    expect(cleanText("<p>첫 줄</p><p><b>둘째</b> 줄</p>a<br/>b<br>c")).toBe("첫 줄\n둘째 줄\na\nb\nc");
  });

  it("엔티티를 디코딩한다", () => {
    expect(cleanText("a&nbsp;&amp;&nbsp;b &lt;div&gt; &quot;q&quot; &#39;s&#39; &#x1F41B; &#44032;")).toBe(
      "a & b <div> \"q\" 's' 🐛 가",
    );
  });

  it("이중 인코딩은 한 단계만 디코딩", () => {
    expect(cleanText("&amp;lt;")).toBe("&lt;");
  });

  it("알 수 없는 엔티티는 그대로 둔다", () => {
    expect(cleanText("&unknown; &#99999999;")).toBe("&unknown; &#99999999;");
  });
});

describe("classify", () => {
  it.each([
    ["[버그] 화면이 깨져요", "버그"],
    ["[개선] 버튼 색 변경", "개선"],
    ["[개선] 에러 메시지 문구 다듬기", "개선"], // 태그가 키워드보다 우선
    ["[버그] 개선 제안 아님", "버그"],
    ["[운영] 관리자 권한 요청", "운영"],
    ["[운영] 배포 후 에러 로그 확인 부탁", "운영"], // 태그가 버그 키워드보다 우선
    ["[개선] 정렬 옵션 [운영]", "개선"], // 먼저 나온 태그 기준
    ["관리자 권한 요청드립니다", "기타"], // 운영은 태그로만 분류
    ["저장이 안됨", "버그"],
    ["에러가 발생합니다", "버그"],
    ["검색 기능 제안", "개선"],
    ["에러 안내 개선", "버그"], // 키워드끼리는 버그 우선
    ["점심 메뉴 추천", "기타"],
  ] as const)("%s → %s", (text, expected) => {
    expect(classify(text)).toBe(expected);
  });

  it("parse 결과에도 반영된다", () => {
    expect(parseTeamsMessage(withText("<at>봇</at> [개선] 다크모드 지원")).type).toBe("개선");
    expect(parseTeamsMessage(withText("<at>봇</at> 회의록 공유")).type).toBe("기타");
  });
});

describe("makeTitle", () => {
  it("첫 줄만 사용하고 유형 태그는 제거", () => {
    expect(makeTitle("[버그] 로그인 실패\n상세 내용")).toBe("로그인 실패");
  });

  it("50자 초과 시 49자 + … 로 자른다", () => {
    const title = makeTitle("가".repeat(60));
    expect(Array.from(title)).toHaveLength(50);
    expect(title).toBe("가".repeat(49) + "…");
  });

  it("정확히 50자는 자르지 않는다", () => {
    expect(makeTitle("a".repeat(50))).toBe("a".repeat(50));
  });

  it("이모지(서로게이트 쌍)를 깨뜨리지 않는다", () => {
    expect(makeTitle("🐛".repeat(55))).toBe("🐛".repeat(49) + "…");
  });

  it("앞의 빈 줄은 건너뛴다", () => {
    expect(makeTitle("\n\n두 번째 줄")).toBe("두 번째 줄");
  });

  it("내용이 없으면 기본 제목", () => {
    expect(makeTitle("")).toBe("(제목 없음)");
    expect(makeTitle("[버그]")).toBe("(제목 없음)");
    expect(parseTeamsMessage(withText("<at>봇</at>")).title).toBe("(제목 없음)");
  });
});

describe("buildMessageLink", () => {
  it("스레드 답글이면 parentMessageId는 루트 메시지", () => {
    const url = new URL(buildMessageLink(fixture)!);
    expect(decodeURIComponent(url.pathname)).toBe(
      "/l/message/19:253b1f341670408fb6fcb9b1ce7d8e2d@thread.tacv2/1759817123456",
    );
    expect(url.searchParams.get("parentMessageId")).toBe("1759817000000");
  });

  it("conversation.id에 messageid가 없으면 자기 자신이 parent, tenantId는 channelData에서", () => {
    const url = new URL(buildMessageLink({ ...fixture, conversation: { id: "19:abc@thread.skype" } })!);
    expect(url.searchParams.get("parentMessageId")).toBe("1759817123456");
    expect(url.searchParams.get("tenantId")).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("tenantId를 전혀 알 수 없으면 생략", () => {
    const url = new URL(buildMessageLink({ id: "1", conversation: { id: "19:abc@thread.skype" } })!);
    expect(url.searchParams.has("tenantId")).toBe(false);
  });

  it.each<[string, TeamsPayload]>([
    ["id 없음", { conversation: fixture.conversation }],
    ["conversation 없음", { id: "1759817123456" }],
    ["채널이 아닌 대화 id", { id: "1", conversation: { id: "a:1abcdef" } }],
    ["숫자가 아닌 메시지 id", { id: "abc", conversation: fixture.conversation }],
  ])("구성 불가(%s) → null", (_label, payload) => {
    expect(buildMessageLink(payload)).toBeNull();
  });
});
