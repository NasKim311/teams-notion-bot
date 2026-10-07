// Teams Outgoing Webhook HMAC 검증.
// 외부 import 없이 WebCrypto만 사용한다 (scripts/send-test.ts 에서 Node로도 import).

const AUTH_HEADER_PATTERN = /^HMAC ([A-Za-z0-9+/]+={0,2})$/;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function importHmacKey(secretB64: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(secretB64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/** raw body에 대한 HMAC-SHA256 서명(base64)을 계산한다. */
export async function computeSignature(rawBody: string, secretB64: string): Promise<string> {
  const key = await importHmacKey(secretB64, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return bytesToBase64(new Uint8Array(sig));
}

/**
 * `Authorization: HMAC <base64>` 헤더를 검증한다.
 * 비교는 crypto.subtle.verify 로 수행해 상수 시간 비교를 보장한다.
 * 형식 오류·디코딩 실패는 throw 하지 않고 false 를 반환한다.
 */
export async function verifyTeamsHmac(
  rawBody: string,
  authHeader: string | null,
  secretB64: string,
): Promise<boolean> {
  const match = authHeader?.match(AUTH_HEADER_PATTERN);
  if (!match?.[1]) return false;

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64ToBytes(match[1]);
  } catch {
    return false;
  }

  const key = await importHmacKey(secretB64, "verify");
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(rawBody));
}
