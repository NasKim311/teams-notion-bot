import { describe, expect, it, vi } from "vitest";
import { buildPageRequest, createNotionPage, NotionError, notionErrorMessage } from "../src/notion";
import type { Issue } from "../src/types";

const issue: Issue = {
  title: "로그인 버튼 무반응",
  type: "버그",
  body: "[버그] 로그인 버튼 무반응\n재현 방법",
  author: "김개발",
  sourceUrl: "https://teams.microsoft.com/l/message/19%3Aabc%40thread.tacv2/1?parentMessageId=1",
};

const env = { NOTION_TOKEN: "secret_token_value", NOTION_DATABASE_ID: "db-123" };

describe("buildPageRequest", () => {
  it("DB 속성과 본문 블록을 매핑한다", () => {
    expect(buildPageRequest(issue, "db-123")).toEqual({
      parent: { database_id: "db-123" },
      properties: {
        제목: { title: [{ type: "text", text: { content: "로그인 버튼 무반응" } }] },
        유형: { select: { name: "버그" } },
        작성자: { rich_text: [{ type: "text", text: { content: "김개발" } }] },
        "원문 링크": { url: issue.sourceUrl },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: issue.body } }] },
        },
      ],
    });
  });

  it("sourceUrl이 null이면 url도 null", () => {
    expect(buildPageRequest({ ...issue, sourceUrl: null }, "db").properties["원문 링크"]).toEqual({ url: null });
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

    expect(fetchMock).toHaveBeenCalledTimes(3); // 생성 + 100 + 30
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("https://api.notion.com/v1/blocks/page-1/children");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string).children).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[2]![1]?.body as string).children).toHaveLength(30);
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
