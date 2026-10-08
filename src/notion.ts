import { chunkText, imageBlocks, type NotionBlock, toBlocks } from "./blocks";
import { structureBody } from "./structure";
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

/** Notion DB 컬럼 이름. DB에서 컬럼 이름을 바꾸면 여기만 바꾼다. */
export const PROP = {
  title: "제목",
  type: "유형",
  author: "작성자",
  workItem: "레드마인 링크",
  mr: "MR 링크",
  branch: "브랜치 명",
  files: "관련 파일",
  areas: "영역",
  platform: "FO/BO",
  status: "상태",
} as const;

/** PROP 각 컬럼의 Notion 타입. DB 싱크 점검(npm run notion:schema)에서 실제 스키마와 비교한다. */
export const PROP_TYPES: Record<keyof typeof PROP, string> = {
  title: "title",
  type: "select",
  author: "select",
  workItem: "url",
  mr: "url",
  branch: "rich_text",
  files: "rich_text",
  areas: "multi_select",
  platform: "select",
  status: "status",
};

const select = (name: string | null) => ({ select: name ? { name } : null });

/** Issue → Notion DB 속성. 작성자·유형·FO/BO는 select라 없는 이름이면 옵션이 새로 생긴다. */
export function buildProperties(issue: Issue) {
  return {
    [PROP.title]: { title: plainText(issue.title) },
    [PROP.type]: select(issue.type),
    [PROP.author]: select(issue.author),
    [PROP.workItem]: { url: issue.workItemUrl },
    [PROP.mr]: { url: issue.mrUrl },
    [PROP.branch]: { rich_text: issue.branch ? plainText(issue.branch) : [] },
    [PROP.files]: { rich_text: issue.files ? plainText(issue.files) : [] },
    [PROP.areas]: { multi_select: issue.areas.map((name) => ({ name })) },
    [PROP.platform]: select(issue.platform),
  };
}

/** POST /v1/pages 요청 바디를 만든다 (본문 블록은 최대 100개, 나머지는 따로 이어 붙인다). */
/** 새 이슈 본문 블록: 고정 틀로 정리한 뒤 블록으로 (업데이트는 정리하지 않음) */
export const newIssueBlocks = (issue: Issue) => toBlocks(structureBody(issue.body));

export function buildPageRequest(issue: Issue, databaseId: string, blocks: NotionBlock[] = newIssueBlocks(issue)) {
  return {
    parent: { database_id: databaseId },
    properties: buildProperties(issue),
    children: blocks.slice(0, MAX_CHILDREN),
  };
}

async function readErrorCode(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { code?: unknown };
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
export async function createNotionPage(
  issue: Issue,
  env: NotionEnv,
  fetchImpl: typeof fetch = fetch,
  imageIds: string[] = [],
): Promise<string> {
  const blocks = [...newIssueBlocks(issue), ...imageBlocks(imageIds)];
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

// ── 스크린샷 업로드 ───────────────────────────────────────────────────────

/**
 * Notion 파일 업로드: 업로드 객체 생성 → multipart로 파일 전송 → id 반환.
 * 반환된 id는 1시간 안에 이미지 블록으로 붙여야 한다.
 */
export async function uploadImage(file: File, env: NotionEnv, fetchImpl: typeof fetch = fetch): Promise<string> {
  const filename = file.name || "screenshot.png";
  const created = await notionRequest<{ id?: unknown }>(
    env,
    "POST",
    "/file_uploads",
    { filename, content_type: file.type },
    fetchImpl,
  );
  if (typeof created.id !== "string") throw new NotionError(200, "missing_upload_id");

  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetchImpl(`${NOTION_API}/file_uploads/${created.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  if (!res.ok) throw new NotionError(res.status, await readErrorCode(res));
  return created.id;
}

// ── 기존 이슈 찾기 / 업데이트 ────────────────────────────────────────────

export interface ExistingPage {
  id: string;
  url: string;
  title: string;
  status: string | null;
}

export interface StatusOptions {
  names: string[];
  /** 진행 중 그룹의 "진행 중" (없으면 그룹 첫 상태) */
  inProgress: string | null;
  /** 완료 그룹의 "완료" (없으면 그룹 첫 상태) */
  complete: string | null;
}

interface PageObject {
  id: string;
  url: string;
  properties: Record<string, { type: string; [key: string]: unknown }>;
}

type RichTextValue = { plain_text?: string }[];

function readText(property: { [key: string]: unknown } | undefined): string {
  const items = (property?.title ?? property?.rich_text) as RichTextValue | undefined;
  return (items ?? []).map((item) => item.plain_text ?? "").join("");
}

function toExistingPage(page: PageObject): ExistingPage {
  const status = page.properties[PROP.status]?.status as { name?: string } | null | undefined;
  return { id: page.id, url: page.url, title: readText(page.properties[PROP.title]), status: status?.name ?? null };
}

/** 상태(status) 컬럼의 옵션. 상태 컬럼이 없으면 빈 값. */
export async function getStatusOptions(env: NotionEnv, fetchImpl: typeof fetch = fetch): Promise<StatusOptions> {
  const db = await notionRequest<{ properties?: Record<string, { type: string; status?: unknown }> }>(
    env,
    "GET",
    `/databases/${env.NOTION_DATABASE_ID}`,
    undefined,
    fetchImpl,
  );
  const status = db.properties?.[PROP.status]?.status as
    | { options?: { id: string; name: string }[]; groups?: { option_ids?: string[] }[] }
    | undefined;
  const options = status?.options ?? [];
  // Notion 상태 그룹은 순서가 고정: 할 일 → 진행 중 → 완료.
  // 같은 이름(진행 중/완료)의 옵션이 그룹에 있으면 그것을, 없으면 그룹의 첫 옵션을 고른다 (완료 그룹의 "미진행" 같은 옵션 회피).
  const pick = (groupIndex: number, preferred: string) => {
    const ids = status?.groups?.[groupIndex]?.option_ids ?? [];
    const inGroup = ids.map((id) => options.find((option) => option.id === id)).filter((option) => option !== undefined);
    return (inGroup.find((option) => option.name === preferred) ?? inGroup[0])?.name ?? null;
  };
  return { names: options.map((option) => option.name), inProgress: pick(1, "진행 중"), complete: pick(2, "완료") };
}

/** 같은 레드마인 일감으로 등록된 페이지를 찾는다. */
export async function findExistingPages(
  issue: Pick<Issue, "workItemUrl">,
  env: NotionEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<ExistingPage[]> {
  if (!issue.workItemUrl) return [];

  const data = await notionRequest<{ results?: PageObject[] }>(
    env,
    "POST",
    `/databases/${env.NOTION_DATABASE_ID}/query`,
    { filter: { property: PROP.workItem, url: { equals: issue.workItemUrl } }, page_size: 5, sorts: [{ timestamp: "created_time", direction: "descending" }] },
    fetchImpl,
  );
  return (data.results ?? []).map(toExistingPage);
}

const mergeList = (current: string, added: string) =>
  [...new Set([...current.split(","), ...added.split(",")].map((item) => item.trim()).filter(Boolean))].join(", ");

/** 업데이트 시 바꿀 속성: 상태, 비어 있던 레드마인/MR 링크·FO/BO, 브랜치 명·관련 파일·영역은 합친다. */
export function buildUpdateProperties(page: PageObject, issue: Issue, status: string | null) {
  const props = page.properties;
  const url = (name: string) => (props[name]?.url as string | null | undefined) ?? null;
  const areas = ((props[PROP.areas]?.multi_select as { name: string }[] | undefined) ?? []).map((option) => option.name);

  const update: Record<string, unknown> = {};
  if (status) update[PROP.status] = { status: { name: status } };
  for (const [name, value] of [[PROP.workItem, issue.workItemUrl], [PROP.mr, issue.mrUrl]] as const) {
    if (value && !url(name) && name in props) update[name] = { url: value };
  }
  if (issue.platform && !props[PROP.platform]?.select && PROP.platform in props) update[PROP.platform] = select(issue.platform);
  for (const [name, value] of [[PROP.branch, issue.branch], [PROP.files, issue.files]] as const) {
    if (!value || !(name in props)) continue;
    const merged = mergeList(readText(props[name]), value);
    if (merged !== readText(props[name])) update[name] = { rich_text: plainText(merged) };
  }
  const newAreas = issue.areas.filter((area) => !areas.includes(area));
  if (newAreas.length > 0 && PROP.areas in props) update[PROP.areas] = { multi_select: [...areas, ...newAreas].map((name) => ({ name })) };
  return update;
}

function updateHeading(issue: Issue, now: Date): NotionBlock[] {
  const when = now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
  return [
    { object: "block", type: "divider", divider: {} },
    { object: "block", type: "heading_3", heading_3: { rich_text: plainText(`🔄 업데이트 · ${issue.author} · ${when}`) } },
  ];
}

/** 기존 페이지 끝에 업데이트 내용을 붙이고 속성을 갱신한다. */
export async function appendUpdate(
  pageId: string,
  issue: Issue,
  status: string | null,
  env: NotionEnv,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
  imageIds: string[] = [],
): Promise<string> {
  const page = await notionRequest<PageObject>(env, "GET", `/pages/${pageId}`, undefined, fetchImpl);
  const blocks = [...updateHeading(issue, now), ...toBlocks(issue.body), ...imageBlocks(imageIds)];
  await appendBlocks(env, page.id, blocks, fetchImpl);

  const properties = buildUpdateProperties(page, issue, status);
  if (Object.keys(properties).length > 0) {
    await notionRequest(env, "PATCH", `/pages/${page.id}`, { properties }, fetchImpl);
  }
  return page.url;
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
