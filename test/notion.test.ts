import { describe, expect, it, vi } from "vitest";
import { buildPageRequest, chunkText, createNotionPage, NotionError } from "../src/notion";
import type { Issue } from "../src/types";

const issue: Issue = {
  title: "로그인 버튼 무반응",
  type: "버그",
  body: "[버그] 로그인 버튼 무반응\n재현 방법",
  author: "김개발",
  sourceUrl: "https://teams.microsoft.com/l/message/19%3Aabc%40thread.tacv2/1?parentMessageId=1",
};

const env = { NOTION_TOKEN: "secret_token_value", NOTION_DATABASE_ID: "db-123" };

describe("chunkText", () => {
  it("2000자 단위로 나눈다 (4500자 → 3개)", () => {
    const chunks = chunkText("a".repeat(4500));
    expect(chunks.map((c) => c.length)).toEqual([2000, 2000, 500]);
  });

  it("빈 문자열이면 빈 배열", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("서로게이트 쌍을 쪼개지 않는다", () => {
    const chunks = chunkText("a" + "🐛".repeat(1000)); // UTF-16 길이 2001
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("a" + "🐛".repeat(999));
    expect(chunks[1]).toBe("🐛");
    expect(chunks.join("")).toBe("a" + "🐛".repeat(1000));
  });
});

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

  it("긴 본문은 2000자 단위 paragraph 블록으로 분할", () => {
    const req = buildPageRequest({ ...issue, body: "가".repeat(4500) }, "db");
    const contents = req.children.map((b) => b.paragraph.rich_text[0]!.text.content.length);
    expect(contents).toEqual([2000, 2000, 500]);
  });

  it("블록은 최대 100개", () => {
    const req = buildPageRequest({ ...issue, body: "a".repeat(2000 * 101) }, "db");
    expect(req.children).toHaveLength(100);
  });

  it("sourceUrl이 null이면 url도 null", () => {
    expect(buildPageRequest({ ...issue, sourceUrl: null }, "db").properties["원문 링크"]).toEqual({ url: null });
  });
});

describe("createNotionPage", () => {
  it("POST /v1/pages 호출 후 페이지 url 반환", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ object: "page", url: "https://www.notion.so/abc123" }),
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
