import { logError } from "../http/log";
import { readJson } from "../http/request";
import { json, jsonError } from "../http/response";
import { FINGERPRINT, markProcessed } from "../store/processed";
import type { Env } from "../types";

// POST /api/processed: 등록이 끝난 메시지의 지문을 기록한다. 다음 미리보기에서 이 메시지들은 빠진다.

const FINGERPRINTS_MAX = 500;

export async function handleProcessed(request: Request, env: Env): Promise<Response> {
  const data = (await readJson(request)) as { fingerprints?: unknown } | undefined;
  const fingerprints = data?.fingerprints;
  if (
    !Array.isArray(fingerprints) ||
    fingerprints.length > FINGERPRINTS_MAX ||
    !fingerprints.every((fp) => typeof fp === "string" && FINGERPRINT.test(fp))
  ) {
    return jsonError(400, "처리한 메시지 정보가 올바르지 않습니다.");
  }
  if (!env.PROCESSED_MESSAGES) return json({ recorded: 0 });

  try {
    await markProcessed(env.PROCESSED_MESSAGES, fingerprints);
    return json({ recorded: fingerprints.length });
  } catch (error) {
    logError("처리한 메시지 기록 실패", error);
    return jsonError(502, "처리한 메시지를 기록하지 못했어요. 다음 미리보기에 이번 메시지가 다시 나올 수 있어요.");
  }
}
