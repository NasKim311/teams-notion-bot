import { chunkText, type NotionBlock, toBlocks } from "./blocks";
import type { Env, Issue } from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_CHILDREN = 100; // 요청당 children 블록 최대 개수

type NotionEnv = Pick<Env, "NOTION_TOKEN" | "NOTION_DATABASE_ID">;

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

function plainText(content: string) {
  return [{ type: "text", text: { content: chunkText(content)[0] ?? "" } }];
}

/** POST /v1/pages 요청 바디를 만든다 (본문 블록은 최대 100개, 나머지는 따로 이어 붙인다). */
export function buildPageRequest(issue: Issue, databaseId: string, blocks: NotionBlock[] = toBlocks(issue.body)) {
  return {
    parent: { database_id: databaseId },
    properties: {
      제목: { title: plainText(issue.title) },
      유형: { select: { name: issue.type } },
      작성자: { rich_text: plainText(issue.author) },
      "원문 링크": { url: issue.sourceUrl },
    },
    children: blocks.slice(0, MAX_CHILDREN),
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

async function notionRequest<T>(
  env: NotionEnv,
  method: string,
  path: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<T> {
  const res = await fetchImpl(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new NotionError(res.status, await readErrorCode(res));
  return (await res.json()) as T;
}

/** 블록을 100개씩 나눠 페이지(또는 블록) 아래에 이어 붙인다. */
export async function appendBlocks(
  env: NotionEnv,
  blockId: string,
  blocks: NotionBlock[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (let i = 0; i < blocks.length; i += MAX_CHILDREN) {
    await notionRequest(env, "PATCH", `/blocks/${blockId}/children`, { children: blocks.slice(i, i + MAX_CHILDREN) }, fetchImpl);
  }
}

/** Notion DB에 페이지를 생성하고 페이지 URL을 반환한다. */
export async function createNotionPage(issue: Issue, env: NotionEnv, fetchImpl: typeof fetch = fetch): Promise<string> {
  const blocks = toBlocks(issue.body);
  const data = await notionRequest<{ id?: unknown; url?: unknown }>(
    env,
    "POST",
    "/pages",
    buildPageRequest(issue, env.NOTION_DATABASE_ID, blocks),
    fetchImpl,
  );
  if (typeof data.url !== "string" || typeof data.id !== "string") throw new NotionError(200, "missing_url");

  if (blocks.length > MAX_CHILDREN) await appendBlocks(env, data.id, blocks.slice(MAX_CHILDREN), fetchImpl);
  return data.url;
}

/** 사용자에게 보여줄 오류 메시지. 토큰 등 비밀값은 포함하지 않는다. */
export function notionErrorMessage(error: unknown): string {
  if (!(error instanceof NotionError)) return "Notion 등록 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
  switch (error.code) {
    case "unauthorized":
      return "Notion 토큰이 올바르지 않아요. NOTION_TOKEN 설정을 확인해주세요.";
    case "restricted_resource":
      return "Notion 연결 권한이 부족해요. 연결(teams-notion-bot)의 기능 설정을 확인해주세요.";
    case "object_not_found":
      return "Notion DB를 찾을 수 없어요. DB ID와 연결(teams-notion-bot) 권한을 확인해주세요.";
    case "validation_error":
      return "Notion DB 속성이 맞지 않아요. DB 컬럼 이름과 유형을 확인해주세요.";
    case "rate_limited":
      return "Notion 요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
    default:
      return `Notion 등록에 실패했어요. (status ${error.status}, ${error.code})`;
  }
}
