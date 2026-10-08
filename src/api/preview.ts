import { logError } from "../http/log";
import { readJson } from "../http/request";
import { json, jsonError } from "../http/response";
import { suggestStatusKind } from "../issue/classify";
import { parseIssues } from "../issue/parse";
import { BODY_MAX } from "../issue/validate";
import { type ExistingPage, findExistingPages, getStatusOptions } from "../notion/pages";
import type { Env, Issue } from "../types";

// POST /api/preview: 붙여넣은 텍스트 → 이슈 초안 + 같은 레드마인 일감의 기존 이슈 후보.

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

export async function handlePreview(request: Request, env: Env): Promise<Response> {
  const data = (await readJson(request)) as { text?: unknown; split?: unknown } | undefined;
  const text = data?.text;
  if (typeof text !== "string" || text.trim() === "") return jsonError(400, "붙여넣은 내용이 없습니다.");
  if (text.length > BODY_MAX) return jsonError(400, "내용이 너무 깁니다.");

  const parsed = parseIssues(text, { redmineIssueUrl: env.REDMINE_ISSUE_URL, split: data?.split !== false });
  return json({ ...parsed, ...(await lookupExisting(parsed.issues, env)) });
}
