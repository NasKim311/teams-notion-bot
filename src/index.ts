import { isAuthorized } from "./auth";
import { BODY_MAX, validateIssue } from "./issue";
import { createNotionPage, NotionError, notionErrorMessage } from "./notion";
import { contentSecurityPolicy, generateNonce, renderPage } from "./page";
import { parseIssues } from "./parse";
import { html, json, jsonError, methodNotAllowed } from "./response";
import type { Env } from "./types";

const REQUEST_MAX = 1_000_000;

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > REQUEST_MAX) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function logError(context: string, error: unknown): void {
  if (error instanceof NotionError) {
    console.error(`${context}: Notion status=${error.status} code=${error.code}`);
  } else {
    console.error(`${context}:`, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
}

async function handlePreview(request: Request, env: Env): Promise<Response> {
  const data = (await readJson(request)) as { text?: unknown; split?: unknown } | undefined;
  const text = data?.text;
  if (typeof text !== "string" || text.trim() === "") return jsonError(400, "붙여넣은 내용이 없습니다.");
  if (text.length > BODY_MAX) return jsonError(400, "내용이 너무 깁니다.");
  return json(parseIssues(text, { redmineIssueUrl: env.REDMINE_ISSUE_URL, split: data?.split !== false }));
}

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const result = validateIssue(await readJson(request));
  if (!result.ok) return jsonError(400, result.error);

  try {
    const url = await createNotionPage(result.value, env);
    return json({ url }, 201);
  } catch (error) {
    logError("Notion 등록 실패", error);
    return jsonError(502, notionErrorMessage(error));
  }
}

const API_ROUTES: Record<string, (request: Request, env: Env) => Promise<Response>> = {
  "/api/preview": handlePreview,
  "/api/issues": handleCreate,
};

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
      const nonce = generateNonce();
      return html(renderPage(nonce), contentSecurityPolicy(nonce));
    }

    const handler = API_ROUTES[pathname];
    if (!handler) return jsonError(404, "Not Found");
    if (request.method !== "POST") return methodNotAllowed("POST");
    if (!(await isAuthorized(request.headers.get("Authorization"), env.FORM_PASSWORD))) {
      return jsonError(401, "비밀번호가 올바르지 않습니다.");
    }
    return handler(request, env);
  },
} satisfies ExportedHandler<Env>;
