import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";

const NOTION_URL = "https://app.notion.com/p/abc123";
const LINK = "https://teams.microsoft.com/l/message/19:abc@thread.v2/1791347527995";

type CfRequest = Request<unknown, IncomingRequestCfProperties>;

function request(
  path: string,
  { method = "GET", body, password = env.FORM_PASSWORD }: { method?: string; body?: string; password?: string | null } = {},
): CfRequest {
  const headers = new Headers();
  if (password !== null) headers.set("Authorization", `Bearer ${encodeURIComponent(password)}`);
  return new Request<unknown, IncomingRequestCfProperties>(`https://bot.example${path}`, { method, body, headers });
}

const post = (path: string, body: unknown, password?: string | null) =>
  request(path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), password });

const call = (req: CfRequest, testEnv: Env = env) => worker.fetch(req, testEnv);

let fetchSpy: MockInstance<typeof fetch>;
let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET / (입력 화면)", () => {
  it("비밀번호 없이 HTML을 내려주고, CSP nonce가 스크립트와 일치", async () => {
    const res = await call(request("/", { password: null }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");

    const csp = res.headers.get("Content-Security-Policy")!;
    const nonce = csp.match(/script-src 'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("default-src 'none'");

    const page = await res.text();
    expect(page).toContain(`<script nonce="${nonce}">`);
    expect(page).toContain("Notion에 등록");
    expect(page).not.toMatch(/style="/); // CSP가 인라인 style 속성을 막으므로 사용 금지
    for (const type of ["버그", "개선", "운영", "기타"]) expect(page).toContain(`<option value="${type}">`);
  });

  it("요청마다 nonce가 다르다", async () => {
    const a = (await call(request("/"))).headers.get("Content-Security-Policy");
    const b = (await call(request("/"))).headers.get("Content-Security-Policy");
    expect(a).not.toBe(b);
  });

  it("POST / 는 405", async () => {
    expect((await call(request("/", { method: "POST" }))).status).toBe(405);
  });
});

describe("라우팅/인증", () => {
  it("없는 경로는 404", async () => {
    expect((await call(request("/nope"))).status).toBe(404);
  });

  it("API는 POST만 허용", async () => {
    const res = await call(request("/api/preview"));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it.each([
    ["비밀번호 없음", null],
    ["틀린 비밀번호", "wrong"],
  ])("%s → 401, Notion 호출 없음", async (_label, password) => {
    const res = await call(post("/api/issues", { title: "x", type: "버그" }, password));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "비밀번호가 올바르지 않습니다." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("서버에 FORM_PASSWORD가 없으면 모두 401", async () => {
    const res = await call(post("/api/preview", { text: "a" }, ""), { ...env, FORM_PASSWORD: "" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/preview", () => {
  it("붙여넣은 텍스트를 Issue 초안으로 돌려준다", async () => {
    const res = await call(post("/api/preview", { text: `[버그] 저장 실패\n작성자: 홍길동\n${LINK}\n상세` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issue: { title: "저장 실패", type: "버그", author: "홍길동", sourceUrl: LINK, body: "[버그] 저장 실패\n상세" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["JSON 아님", "not json"],
    ["text 없음", { foo: 1 }],
    ["빈 text", { text: "  " }],
  ])("%s → 400", async (_label, body) => {
    expect((await call(post("/api/preview", body))).status).toBe(400);
  });
});

describe("POST /api/issues", () => {
  const issue = { title: "저장 실패", type: "버그", author: "홍길동", sourceUrl: LINK, body: "상세" };

  it("Notion 페이지를 만들고 url을 돌려준다 (201)", async () => {
    fetchSpy.mockResolvedValue(Response.json({ object: "page", url: NOTION_URL }));

    const res = await call(post("/api/issues", issue));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ url: NOTION_URL });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/pages");
    const sent = JSON.parse(init?.body as string);
    expect(sent.parent).toEqual({ database_id: env.NOTION_DATABASE_ID });
    expect(sent.properties["원문 링크"]).toEqual({ url: LINK });
  });

  it("검증 실패 → 400 + 메시지, Notion 호출 없음", async () => {
    const res = await call(post("/api/issues", { ...issue, type: "질문" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "유형이 올바르지 않습니다." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Notion 오류 → 502 + 원인 안내, 로그엔 status/code만", async () => {
    fetchSpy.mockResolvedValue(
      Response.json({ object: "error", code: "validation_error", message: "제목 is not a property" }, { status: 400 }),
    );

    const res = await call(post("/api/issues", issue));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("속성이 맞지 않아요");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("status=400 code=validation_error"));
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(env.NOTION_TOKEN);
  });

  it("네트워크 오류 → 502 일반 안내", async () => {
    fetchSpy.mockRejectedValue(new TypeError("network down"));
    const res = await call(post("/api/issues", issue));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("잠시 후 다시 시도");
  });
});
