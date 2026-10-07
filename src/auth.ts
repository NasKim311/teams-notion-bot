// 공유 비밀번호 확인. 클라이언트는 `Authorization: Bearer <encodeURIComponent(비밀번호)>`로 보낸다.

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

/** 비밀번호가 일치하면 true. 서버 비밀번호가 비어 있으면 항상 false. */
export async function isAuthorized(authHeader: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected) return false;

  const encoded = authHeader?.match(/^Bearer (\S+)$/)?.[1];
  if (!encoded) return false;

  let provided: string;
  try {
    provided = decodeURIComponent(encoded);
  } catch {
    return false;
  }

  // 길이가 같은 해시끼리 비교해 상수 시간 비교를 보장한다.
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}
