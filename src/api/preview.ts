import { logError } from "../http/log";
import { readJson } from "../http/request";
import { json, jsonError } from "../http/response";
import { suggestStatusKind } from "../issue/classify";
import { type Message, messageKey, messageLines, splitMessages } from "../issue/messages";
import { type Prepared, parsePrepared, prepare } from "../issue/parse";
import { BODY_MAX } from "../issue/validate";
import { type ExistingPage, findExistingPages, getStatusOptions } from "../notion/pages";
import { findProcessed, fingerprint } from "../store/processed";
import type { Env, Issue } from "../types";

// POST /api/preview: 붙여넣은 텍스트 → 이슈 초안 + 같은 레드마인 일감의 기존 이슈 후보.
// 이미 처리(등록)한 메시지는 빼고 새 메시지만 정리한다 (excludeProcessed: false면 모두 포함).

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

interface Filtered {
  prepared: Prepared;
  /** 이미 처리해서 뺀 메시지 수 */
  excluded: number;
  /** 남은 메시지의 지문. 등록이 끝나면 클라이언트가 /api/processed로 기록을 요청한다 */
  fingerprints: string[];
}

/** 이미 처리한 메시지를 뺀다. KV를 읽지 못하면 빼지 않고 계속한다. */
async function filterProcessed(prepared: Prepared, env: Env, enabled: boolean): Promise<Filtered> {
  const messages = await Promise.all(
    splitMessages(prepared.lines).map(async (message: Message) => {
      const key = messageKey(message);
      return { message, fp: key ? await fingerprint(key) : null };
    }),
  );

  let processed = new Set<string>();
  if (enabled && env.PROCESSED_MESSAGES) {
    try {
      processed = await findProcessed(
        env.PROCESSED_MESSAGES,
        messages.flatMap(({ fp }) => (fp ? [fp] : [])),
      );
    } catch (error) {
      logError("처리한 메시지 조회 실패", error);
    }
  }

  const kept = messages.filter(({ fp }) => !fp || !processed.has(fp));
  const excluded = messages.length - kept.length;
  // 앞 메시지가 빠졌으면 작성자는 남은 첫 메시지의 작성자
  const author =
    excluded > 0 ? (kept.find(({ message }) => message.author)?.message.author ?? prepared.author) : prepared.author;
  return {
    prepared: { ...prepared, author: author ?? undefined, lines: messageLines(kept.map(({ message }) => message)) },
    excluded,
    fingerprints: kept.flatMap(({ fp }) => (fp ? [fp] : [])),
  };
}

export async function handlePreview(request: Request, env: Env): Promise<Response> {
  const data = (await readJson(request)) as { text?: unknown; split?: unknown; excludeProcessed?: unknown } | undefined;
  const text = data?.text;
  if (typeof text !== "string" || text.trim() === "") return jsonError(400, "붙여넣은 내용이 없습니다.");
  if (text.length > BODY_MAX) return jsonError(400, "내용이 너무 깁니다.");

  const { prepared, excluded, fingerprints } = await filterProcessed(
    prepare(text),
    env,
    data?.excludeProcessed !== false,
  );
  // 모두 이미 처리한 메시지면 이슈 없이 알려준다
  const parsed = prepared.lines.some((line) => line.trim() !== "")
    ? parsePrepared(prepared, { redmineIssueUrl: env.REDMINE_ISSUE_URL, split: data?.split !== false })
    : { issues: [], splittable: false };
  return json({ ...parsed, excluded, fingerprints, ...(await lookupExisting(parsed.issues, env)) });
}
