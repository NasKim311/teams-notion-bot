import { describe, expect, it, vi } from "vitest";
import { buildPageRequest, createNotionPage, NotionError, notionErrorMessage } from "../src/notion";
import type { Issue } from "../src/types";

const issue: Issue = {
  title: "로그인 버튼 무반응",
  type: "버그",
  body: "[버그] 로그인 버튼 무반응\n재현 방법",
  author: "김개발",
  platform: null,
  workItemUrl: null,
  mrUrl: null,
  branch: "",
  files: "",
  areas: [],
};

const heading = (content: string) => ({
  object: "block",
  type: "heading_3",
  heading_3: { rich_text: [{ type: "text", text: { content } }] },
});

const env = { NOTION_TOKEN: "secret_token_value", NOTION_DATABASE_ID: "db-123" };

describe("buildPageRequest", () => {
  it("DB 속성과 본문 블록을 매핑한다", () => {
    expect(buildPageRequest(issue, "db-123")).toEqual({
      parent: { database_id: "db-123" },
      properties: {
        제목: { title: [{ type: "text", text: { content: "로그인 버튼 무반응" } }] },
        유형: { select: { name: "버그" } },
        작성자: { select: { name: "김개발" } },
        "레드마인 링크": { url: null },
        "MR 링크": { url: null },
        "브랜치 명": { rich_text: [] },
        "관련 파일": { rich_text: [] },
        영역: { multi_select: [] },
        "FO/BO": { select: null },
      },
      children: [
        // 새 이슈 본문은 고정 틀로 정리된다 (라벨 없는 글 → 현상, 빈 섹션도 제목은 넣음)
        heading("🐞 현상"),
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: issue.body } }] },
        },
        heading("🎯 기대 동작"),
        heading("🔍 원인"),
        heading("🛠 처리·해결"),
        heading("📎 참고"),
      ],
    });
  });

  it("개발 정보 속성 매핑", () => {
    const props = buildPageRequest(
      {
        ...issue,
        workItemUrl: "http://redmine.example.com/issues/1",
        mrUrl: "http://gitlab.example.com/a/-/merge_requests/2",
        branch: "feature/x",
        files: "src/A.tsx:1, src/B.tsx",
        areas: ["fit", "evt"],
        platform: "BO",
      },
      "db",
    ).properties;
    expect(props).toMatchObject({
      "레드마인 링크": { url: "http://redmine.example.com/issues/1" },
      "MR 링크": { url: "http://gitlab.example.com/a/-/merge_requests/2" },
      "브랜치 명": { rich_text: [{ text: { content: "feature/x" } }] },
      "관련 파일": { rich_text: [{ text: { content: "src/A.tsx:1, src/B.tsx" } }] },
      영역: { multi_select: [{ name: "fit" }, { name: "evt" }] },
      "FO/BO": { select: { name: "BO" } },
    });
  });

  it("children은 최대 100개", () => {
    const body = Array.from({ length: 150 }, (_, i) => `문단 ${i}`).join("\n\n");
    expect(buildPageRequest({ ...issue, body }, "db").children).toHaveLength(100);
  });
});

describe("createNotionPage", () => {
  it("POST /v1/pages 호출 후 페이지 url 반환", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ object: "page", id: "page-1", url: "https://www.notion.so/abc123" }),
    );

    await expect(createNotionPage(issue, env, fetchMock)).resolves.toBe("https://www.notion.so/abc123");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/pages");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer secret_token_value");
    expect(headers.get("Notion-Version")).toBe("2022-06-28");
    expect(JSON.parse(init?.body as string)).toEqual(buildPageRequest(issue, "db-123"));
  });

  it("블록이 100개를 넘으면 나머지를 이어 붙인다", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ id: "page-1", url: "https://www.notion.so/p" }));
    const body = Array.from({ length: 230 }, (_, i) => `문단 ${i}`).join("\n\n");

    await createNotionPage({ ...issue, body }, env, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(3); // 생성(소제목 1 + 문단 99) + 100 + 35(문단 31 + 빈 섹션 제목 4)
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("https://api.notion.com/v1/blocks/page-1/children");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string).children).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[2]![1]?.body as string).children).toHaveLength(35);
  });

  it("오류 응답이면 status/code를 담은 NotionError (토큰 미포함)", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ object: "error", status: 400, code: "validation_error", message: "bad" }, { status: 400 }),
    );

    const error = await createNotionPage(issue, env, fetchMock).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotionError);
    expect(error).toMatchObject({ status: 400, code: "validation_error" });
    expect(String((error as Error).message)).not.toContain(env.NOTION_TOKEN);
  });

  it("오류 바디가 JSON이 아니어도 NotionError", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("Bad Gateway", { status: 502 }));
    await expect(createNotionPage(issue, env, fetchMock)).rejects.toMatchObject({ status: 502, code: "unknown" });
  });

  it("응답에 url이 없으면 NotionError", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ object: "page" }));
    await expect(createNotionPage(issue, env, fetchMock)).rejects.toMatchObject({ code: "missing_url" });
  });
});

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

describe("기존 이슈 찾기/업데이트", () => {
  const STATUS_SCHEMA = {
    properties: {
      상태: {
        type: "status",
        status: {
          options: [
            { id: "s1", name: "시작 전" },
            { id: "s2", name: "진행 중" },
            { id: "s3", name: "완료" },
          ],
          groups: [{ option_ids: ["s1"] }, { option_ids: ["s2"] }, { option_ids: ["s3"] }],
        },
      },
    },
  };

  const page = (overrides: Record<string, unknown> = {}) => ({
    id: "11111111-2222-3333-4444-555555555555",
    url: "https://www.notion.so/existing",
    properties: {
      제목: { type: "title", title: [{ plain_text: "기존 이슈" }] },
      상태: { type: "status", status: { name: "진행 중" } },
      "레드마인 링크": { type: "url", url: null },
      "MR 링크": { type: "url", url: "http://gitlab.example.com/a/-/merge_requests/1" },
      "브랜치 명": { type: "rich_text", rich_text: [{ plain_text: "feature/a" }] },
      "관련 파일": { type: "rich_text", rich_text: [] },
      영역: { type: "multi_select", multi_select: [{ name: "fit" }] },
      "FO/BO": { type: "select", select: null },
      ...overrides,
    },
  });

  it("getStatusOptions: 완료 그룹에 '완료'가 있으면 첫 옵션('미진행')보다 우선", async () => {
    const schema = {
      properties: {
        상태: {
          type: "status",
          status: {
            options: [
              { id: "a", name: "검토 필요" },
              { id: "b", name: "시작 전" },
              { id: "c", name: "진행 중" },
              { id: "d", name: "미진행" },
              { id: "e", name: "완료" },
            ],
            groups: [{ option_ids: ["a", "b"] }, { option_ids: ["c"] }, { option_ids: ["d", "e"] }],
          },
        },
      },
    };
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(schema));
    await expect((await import("../src/notion")).getStatusOptions(env, fetchMock)).resolves.toMatchObject({
      inProgress: "진행 중",
      complete: "완료",
    });
  });

  it("getStatusOptions: 옵션 이름과 진행 중/완료 그룹의 첫 상태", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(STATUS_SCHEMA));
    await expect((await import("../src/notion")).getStatusOptions(env, fetchMock)).resolves.toEqual({
      names: ["시작 전", "진행 중", "완료"],
      inProgress: "진행 중",
      complete: "완료",
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.notion.com/v1/databases/db-123");
  });

  it("findExistingPages: 레드마인 링크로 조회", async () => {
    const { findExistingPages } = await import("../src/notion");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ results: [page()] }));

    const found = await findExistingPages({ workItemUrl: "http://r/issues/1" }, env, fetchMock);
    expect(found).toEqual([
      { id: "11111111-2222-3333-4444-555555555555", url: "https://www.notion.so/existing", title: "기존 이슈", status: "진행 중" },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/databases/db-123/query");
    expect(JSON.parse(init?.body as string).filter).toEqual({ property: "레드마인 링크", url: { equals: "http://r/issues/1" } });
  });

  it("findExistingPages: 찾을 단서가 없으면 호출하지 않음", async () => {
    const { findExistingPages } = await import("../src/notion");
    const fetchMock = vi.fn<typeof fetch>();
    await expect(findExistingPages({ workItemUrl: null }, env, fetchMock)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("buildUpdateProperties: 상태 변경, 빈 레드마인 링크·FO/BO만 채우고 MR은 유지, 목록은 합침", async () => {
    const { buildUpdateProperties } = await import("../src/notion");
    const update = buildUpdateProperties(
      page(),
      {
        ...issue,
        workItemUrl: "http://r/issues/9",
        mrUrl: "http://gitlab.example.com/a/-/merge_requests/2",
        branch: "feature/a, feature/b",
        files: "src/A.tsx:1",
        areas: ["fit", "evt"],
        platform: "FO",
      },
      "완료",
    );
    expect(update).toEqual({
      상태: { status: { name: "완료" } },
      "레드마인 링크": { url: "http://r/issues/9" },
      "FO/BO": { select: { name: "FO" } },
      "브랜치 명": { rich_text: [{ type: "text", text: { content: "feature/a, feature/b" } }] },
      "관련 파일": { rich_text: [{ type: "text", text: { content: "src/A.tsx:1" } }] },
      영역: { multi_select: [{ name: "fit" }, { name: "evt" }] },
    });
  });

  it("buildUpdateProperties: 바뀔 게 없으면 빈 객체, DB에 없는 컬럼은 건드리지 않음", async () => {
    const { buildUpdateProperties } = await import("../src/notion");
    expect(buildUpdateProperties(page(), { ...issue, branch: "feature/a" }, null)).toEqual({});
    const withPlatform = page({ "FO/BO": { type: "select", select: { name: "BO" } } });
    expect(buildUpdateProperties(withPlatform, { ...issue, platform: "FO" }, null)).toEqual({}); // 이미 있으면 유지
    expect(buildUpdateProperties({ id: "x", url: "u", properties: {} }, { ...issue, mrUrl: "http://m/1", areas: ["a"] }, null)).toEqual({});
  });

  it("appendUpdate: 페이지 조회 → 구분선·업데이트 제목·본문 추가 → 속성 갱신", async () => {
    const { appendUpdate } = await import("../src/notion");
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/children") ? Response.json({}) : Response.json(page()),
    );

    const url = await appendUpdate(page().id, { ...issue, body: "수정 완료했습니다" }, "완료", env, fetchMock, new Date("2026-10-08T05:30:00Z"));
    expect(url).toBe("https://www.notion.so/existing");

    const calls = fetchMock.mock.calls.map(([u, init]) => `${init?.method} ${String(u).replace("https://api.notion.com/v1", "")}`);
    expect(calls).toEqual([
      `GET /pages/${page().id}`,
      `PATCH /blocks/${page().id}/children`,
      `PATCH /pages/${page().id}`,
    ]);
    const children = JSON.parse(fetchMock.mock.calls[1]![1]?.body as string).children;
    expect(children.map((b: { type: string }) => b.type)).toEqual(["divider", "heading_3", "paragraph"]);
    expect(children[1].heading_3.rich_text[0].text.content).toMatch(/^🔄 업데이트 · 김개발 · /);
    expect(JSON.parse(fetchMock.mock.calls[2]![1]?.body as string)).toEqual({ properties: { 상태: { status: { name: "완료" } } } });
  });
});
