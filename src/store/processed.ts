import type { KeyValueStore } from "../types";

// 이미 처리(등록)한 Teams 메시지의 지문(SHA-256)을 KV에 기록·조회한다. 메시지 원문은 저장하지 않는다.

const KEY_PREFIX = "msg:";
/** 1년이 지나면 기록이 사라진다 (오래된 대화를 다시 붙여넣을 일은 드물다) */
const TTL_SECONDS = 365 * 24 * 60 * 60;

/** SHA-256 16진수 64자 */
export const FINGERPRINT = /^[0-9a-f]{64}$/;

/** 메시지 기준 문자열(messageKey) → 지문 */
export async function fingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 이미 처리한 것으로 기록된 지문만 돌려준다. */
export async function findProcessed(kv: KeyValueStore, fingerprints: string[]): Promise<Set<string>> {
  const unique = [...new Set(fingerprints)];
  const found = await Promise.all(unique.map((fp) => kv.get(KEY_PREFIX + fp)));
  return new Set(unique.filter((_, i) => found[i] !== null));
}

/** 지문들을 처리한 것으로 기록한다 (값은 기록 시각). */
export async function markProcessed(kv: KeyValueStore, fingerprints: string[], now: Date = new Date()): Promise<void> {
  const unique = [...new Set(fingerprints)];
  await Promise.all(unique.map((fp) => kv.put(KEY_PREFIX + fp, now.toISOString(), { expirationTtl: TTL_SECONDS })));
}
