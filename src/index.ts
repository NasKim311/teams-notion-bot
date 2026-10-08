import { isAuthorized } from "./auth";
import { BODY_MAX, validateIssue } from "./issue";
import {
  appendUpdate,
  createNotionPage,
  type ExistingPage,
  findExistingPages,
  getStatusOptions,
  NotionError,
  notionErrorMessage,
  uploadImage,
} from "./notion";
import { contentSecurityPolicy, generateNonce, renderPage } from "./page";
import { parseIssues, suggestStatusKind } from "./parse";
import { html, json, jsonError, methodNotAllowed } from "./response";
import type { Env, Issue } from "./types";

const REQUEST_MAX = 1_000_000;
const PAGE_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const STATUS_MAX = 100;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGES_MAX = 10;

/** 업로드된 이미지 id 목록 검증. 없으면 빈 배열, 형식이 틀리면 undefined. */
function readImageIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > IMAGES_MAX) return undefined;
  return value.every((id) => typeof id === "string" && PAGE_ID.test(id)) ? (value as string[]) : undefined;
}

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

interface Lookup {
  matches: ExistingPage[];
  suggestedStatus: string | null;
}

/** 이슈마다 같은 레드마인 일감의 기존 페이지를 찾는다. 실패해도 미리보기는 계속한다. */
async function lookupExisting(
  issues: Issue[],
  env: Env,
): Promise<{ lookups: Lookup[]; statusOptions: string[]; lookupError?: string }> {
  const empty = { lookups: issues.map(() => ({ matches: [], suggestedStatus: null })), statusOptions: [] };
  if (!issues.some((issue) => issue.workItemUrl)) return empty;

  try {
    const [status, matches] = await Promise.all([
      getStatusOptions(env),
      Promise.all(issues.map((issue) => findExistingPages(issue, env))),
    ]);
    return {
      statusOptions: status.names,
      lookups: issues.map((issue, i) => {
        const kind = suggestStatusKind(issue.body);
        return { matches: matches[i] ?? [], suggestedStatus: kind ? status[kind] : null };
      }),
    };
  } catch (error) {
    logError("기존 이슈 조회 실패", error);
    return { ...empty, lookupError: "기존 이슈를 조회하지 못했어요. 새 이슈로만 등록할 수 있어요." };
  }
}

async function handlePreview(request: Request, env: Env): Promise<Response> {
  const data = (await readJson(request)) as { text?: unknown; split?: unknown } | undefined;
  const text = data?.text;
  if (typeof text !== "string" || text.trim() === "") return jsonError(400, "붙여넣은 내용이 없습니다.");
  if (text.length > BODY_MAX) return jsonError(400, "내용이 너무 깁니다.");

  const parsed = parseIssues(text, { redmineIssueUrl: env.REDMINE_ISSUE_URL, split: data?.split !== false });
  return json({ ...parsed, ...(await lookupExisting(parsed.issues, env)) });
}

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const data = await readJson(request);
  const result = validateIssue(data);
  if (!result.ok) return jsonError(400, result.error);
  const imageIds = readImageIds((data as { imageIds?: unknown }).imageIds);
  if (!imageIds) return jsonError(400, "스크린샷 정보가 올바르지 않습니다.");

  try {
    const url = await createNotionPage(result.value, env, fetch, imageIds);
    return json({ url }, 201);
  } catch (error) {
    logError("Notion 등록 실패", error);
    return jsonError(502, notionErrorMessage(error));
  }
}

async function handleUpdate(request: Request, env: Env): Promise<Response> {
  const data = (await readJson(request)) as
    | { pageId?: unknown; issue?: unknown; status?: unknown; imageIds?: unknown }
    | undefined;
  if (typeof data?.pageId !== "string" || !PAGE_ID.test(data.pageId))
    return jsonError(400, "기존 이슈 정보가 올바르지 않습니다.");

  const status = data.status === null || data.status === undefined || data.status === "" ? null : data.status;
  if (status !== null && (typeof status !== "string" || status.length > STATUS_MAX))
    return jsonError(400, "상태 값이 올바르지 않습니다.");

  const result = validateIssue(data.issue);
  if (!result.ok) return jsonError(400, result.error);
  const imageIds = readImageIds(data.imageIds);
  if (!imageIds) return jsonError(400, "스크린샷 정보가 올바르지 않습니다.");

  try {
    const url = await appendUpdate(data.pageId, result.value, status, env, fetch, new Date(), imageIds);
    return json({ url });
  } catch (error) {
    logError("Notion 업데이트 실패", error);
    return jsonError(502, notionErrorMessage(error));
  }
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  if (!(request.headers.get("Content-Type") ?? "").startsWith("multipart/form-data")) {
    return jsonError(400, "이미지 파일을 보내주세요.");
  }
  let file: File | string | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError(400, "이미지 파일을 읽지 못했습니다.");
  }
  if (!(file instanceof File)) return jsonError(400, "이미지 파일을 보내주세요.");
  if (!IMAGE_TYPES.has(file.type)) return jsonError(400, "PNG, JPEG, GIF, WEBP 이미지만 첨부할 수 있어요.");
  if (file.size > IMAGE_MAX_BYTES) return jsonError(400, "이미지는 5MB 이하만 첨부할 수 있어요.");

  try {
    return json({ id: await uploadImage(file, env) }, 201);
  } catch (error) {
    logError("이미지 업로드 실패", error);
    return jsonError(502, notionErrorMessage(error));
  }
}

const API_ROUTES: Record<string, (request: Request, env: Env) => Promise<Response>> = {
  "/api/preview": handlePreview,
  "/api/issues": handleCreate,
  "/api/issues/update": handleUpdate,
  "/api/uploads": handleUpload,
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
