import { structureBody } from "../issue/structure";
import type { Issue } from "../types";
import { imageBlocks, type NotionBlock, toBlocks } from "./blocks";
import { appendBlocks, MAX_CHILDREN, type NotionEnv, NotionError, notionRequest } from "./client";
import { buildProperties, buildUpdateProperties, type PageObject, PROP, plainText, readText } from "./properties";

// 이슈 페이지: 새로 만들기, 같은 일감의 기존 페이지 찾기, 업데이트 붙이기.

/** 새 이슈 본문 블록: 고정 틀로 정리한 뒤 블록으로 (업데이트는 정리하지 않음) */
export const newIssueBlocks = (issue: Issue) => toBlocks(structureBody(issue.body));

/** POST /v1/pages 요청 바디를 만든다 (본문 블록은 최대 100개, 나머지는 따로 이어 붙인다). */
export function buildPageRequest(issue: Issue, databaseId: string, blocks: NotionBlock[] = newIssueBlocks(issue)) {
  return {
    parent: { database_id: databaseId },
    properties: buildProperties(issue),
    children: blocks.slice(0, MAX_CHILDREN),
  };
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
    const inGroup = ids
      .map((id) => options.find((option) => option.id === id))
      .filter((option) => option !== undefined);
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
    {
      filter: { property: PROP.workItem, url: { equals: issue.workItemUrl } },
      page_size: 5,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
    },
    fetchImpl,
  );
  return (data.results ?? []).map(toExistingPage);
}

function updateHeading(issue: Issue, now: Date): NotionBlock[] {
  const when = now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
  return [
    { object: "block", type: "divider", divider: {} },
    {
      object: "block",
      type: "heading_3",
      heading_3: { rich_text: plainText(`🔄 업데이트 · ${issue.author} · ${when}`) },
    },
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
