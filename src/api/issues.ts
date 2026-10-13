import { logError } from "../http/log";
import { PAGE_ID, readImageIds, readJson } from "../http/request";
import { json, jsonError } from "../http/response";
import { normalizeWorkItemUrl } from "../issue/extract";
import { validateIssue } from "../issue/validate";
import { notionErrorMessage } from "../notion/client";
import { appendUpdate, createNotionPage } from "../notion/pages";
import type { Env, Issue } from "../types";

// POST /api/issues(새 이슈 생성), POST /api/issues/update(기존 이슈에 업데이트 추가).

const STATUS_MAX = 100;

/** 카드에서 고친 레드마인 링크도 표준 주소로 저장한다 (I11) */
const withStandardLink = (issue: Issue, env: Env): Issue => ({
  ...issue,
  workItemUrl: normalizeWorkItemUrl(issue.workItemUrl, env.REDMINE_ISSUE_URL),
});

export async function handleCreate(request: Request, env: Env): Promise<Response> {
  const data = await readJson(request);
  const result = validateIssue(data);
  if (!result.ok) return jsonError(400, result.error);
  const imageIds = readImageIds((data as { imageIds?: unknown }).imageIds);
  if (!imageIds) return jsonError(400, "스크린샷 정보가 올바르지 않습니다.");

  try {
    const url = await createNotionPage(withStandardLink(result.value, env), env, fetch, imageIds);
    return json({ url }, 201);
  } catch (error) {
    logError("Notion 등록 실패", error);
    return jsonError(502, notionErrorMessage(error));
  }
}

export async function handleUpdate(request: Request, env: Env): Promise<Response> {
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
    const url = await appendUpdate(
      data.pageId,
      withStandardLink(result.value, env),
      status,
      env,
      fetch,
      new Date(),
      imageIds,
    );
    return json({ url });
  } catch (error) {
    logError("Notion 업데이트 실패", error);
    return jsonError(502, notionErrorMessage(error));
  }
}
