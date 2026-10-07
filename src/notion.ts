import type { Env, Issue } from "./types";

const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";
const TEXT_LIMIT = 2000; // rich_text 한 덩어리 최대 길이
const MAX_CHILDREN = 100; // 요청당 children 블록 최대 개수

export class NotionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Notion API error: ${status} ${code}`);
    this.name = "NotionError";
    this.status = status;
    this.code = code;
  }
}

/**
 * 텍스트를 최대 2000자 단위로 나눈다.
 * 코드포인트(서로게이트 쌍)를 쪼개지 않으면서 UTF-16 길이 기준으로도 한도를 넘지 않게 한다.
 */
export function chunkText(text: string, size = TEXT_LIMIT): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const ch of text) {
    if (current.length + ch.length > size) {
      chunks.push(current);
      current = "";
    }
    current += ch;
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

function richText(content: string) {
  return [{ type: "text", text: { content: chunkText(content)[0] ?? "" } }];
}

/** POST /v1/pages 요청 바디를 만든다. */
export function buildPageRequest(issue: Issue, databaseId: string) {
  const children = chunkText(issue.body)
    .slice(0, MAX_CHILDREN)
    .map((content) => ({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content } }] },
    }));

  return {
    parent: { database_id: databaseId },
    properties: {
      제목: { title: richText(issue.title) },
      유형: { select: { name: issue.type } },
      작성자: { rich_text: richText(issue.author) },
      "원문 링크": { url: issue.sourceUrl },
    },
    children,
  };
}

async function readErrorCode(res: Response): Promise<string> {
  try {
    const data: { code?: unknown } = await res.json();
    return typeof data.code === "string" ? data.code : "unknown";
  } catch {
    return "unknown";
  }
}

/** Notion DB에 페이지를 생성하고 페이지 URL을 반환한다. */
export async function createNotionPage(
  issue: Issue,
  env: Pick<Env, "NOTION_TOKEN" | "NOTION_DATABASE_ID">,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(NOTION_PAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPageRequest(issue, env.NOTION_DATABASE_ID)),
  });

  if (!res.ok) throw new NotionError(res.status, await readErrorCode(res));

  const data: { url?: unknown } = await res.json();
  if (typeof data.url !== "string") throw new NotionError(res.status, "missing_url");
  return data.url;
}

/** 사용자에게 보여줄 오류 메시지. 토큰 등 비밀값은 포함하지 않는다. */
export function notionErrorMessage(error: unknown): string {
  if (!(error instanceof NotionError)) return "Notion 등록 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
  switch (error.code) {
    case "unauthorized":
      return "Notion 토큰이 올바르지 않아요. NOTION_TOKEN 설정을 확인해주세요.";
    case "object_not_found":
      return "Notion DB를 찾을 수 없어요. DB ID와 연결(teams-notion-bot) 권한을 확인해주세요.";
    case "validation_error":
      return "Notion DB 속성이 맞지 않아요. 제목/유형/작성자/원문 링크 속성을 확인해주세요.";
    case "rate_limited":
      return "Notion 요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
    default:
      return `Notion 등록에 실패했어요. (status ${error.status}, ${error.code})`;
  }
}
