import { handleCreate, handleUpdate } from "./api/issues";
import { handlePreview } from "./api/preview";
import { handleProcessed } from "./api/processed";
import { handleUpload } from "./api/uploads";
import { isAuthorized } from "./http/auth";
import { html, jsonError, methodNotAllowed } from "./http/response";
import { contentSecurityPolicy, generateNonce, renderPage } from "./page/page";
import type { Env } from "./types";

// Worker 진입점: 라우팅과 비밀번호 확인만 한다. 처리는 api/ 모듈이 맡는다.

const API_ROUTES: Record<string, (request: Request, env: Env) => Promise<Response>> = {
  "/api/preview": handlePreview,
  "/api/issues": handleCreate,
  "/api/issues/update": handleUpdate,
  "/api/uploads": handleUpload,
  "/api/processed": handleProcessed,
};

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
      const nonce = generateNonce();
      return html(renderPage(nonce), contentSecurityPolicy(nonce));
    }

    const handler = API_ROUTES[pathname];
    if (!handler) return jsonError(404, "Not Found");
    if (request.method !== "POST") return methodNotAllowed("POST");
    if (!(await isAuthorized(request.headers.get("Authorization"), env.FORM_PASSWORD))) {
      return jsonError(401, "비밀번호가 올바르지 않습니다.");
    }
    return handler(request, env);
  },
} satisfies ExportedHandler<Env>;
