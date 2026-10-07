import { createNotionPage, NotionError } from "./notion";
import { parseTeamsMessage } from "./parse";
import { errorReply, methodNotAllowed, pendingReply, successReply, unauthorized } from "./reply";
import type { Env, Issue, TeamsPayload } from "./types";
import { verifyTeamsHmac } from "./verify";

// Teams는 5초 안에 응답을 받아야 하므로 Notion 호출은 4초까지만 기다린다.
const NOTION_TIMEOUT_MS = 4000;
const TIMEOUT = Symbol("timeout");

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function logError(context: string, error: unknown): void {
  if (error instanceof NotionError) {
    console.error(`${context}: Notion status=${error.status} code=${error.code}`);
  } else {
    console.error(`${context}:`, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed();

    // body는 서명 검증과 파싱에 같은 문자열을 쓰도록 한 번만 읽는다.
    const raw = await request.text();
    try {
      if (!(await verifyTeamsHmac(raw, request.headers.get("Authorization"), env.TEAMS_HMAC_SECRET))) {
        return unauthorized();
      }
    } catch (error) {
      logError("HMAC 검증 오류 (TEAMS_HMAC_SECRET 설정 확인)", error);
      return unauthorized();
    }

    if (env.DEBUG === "true") console.log("[DEBUG] Teams payload:", raw);

    let issue: Issue;
    try {
      issue = parseTeamsMessage(JSON.parse(raw) as TeamsPayload);
    } catch (error) {
      logError("payload 파싱 실패", error);
      return errorReply();
    }

    const task = createNotionPage(issue, env);
    try {
      const result = await withTimeout(task, NOTION_TIMEOUT_MS);
      if (result === TIMEOUT) {
        ctx.waitUntil(
          task.then(
            (url) => console.log(`지연 등록 완료: ${url}`),
            (error) => logError("지연 등록 실패", error),
          ),
        );
        return pendingReply();
      }
      return successReply(issue.title, result);
    } catch (error) {
      logError("Notion 등록 실패", error);
      return errorReply();
    }
  },
} satisfies ExportedHandler<Env>;
