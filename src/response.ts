// HTTP 응답 생성기.

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: SECURITY_HEADERS });
}

export function jsonError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error: message }, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

export function methodNotAllowed(allow: string): Response {
  return jsonError(405, "Method Not Allowed", { Allow: allow });
}
