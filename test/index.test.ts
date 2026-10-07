import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import { computeSignature } from "../src/verify";
import fixture from "./fixtures/teams-payload.json";

const raw = JSON.stringify(fixture);
const NOTION_URL = "https://www.notion.so/abc123";

async function signedRequest(body = raw, method = "POST"): Promise<Request<unknown, IncomingRequestCfProperties>> {
  const sig = await computeSignature(body, env.TEAMS_HMAC_SECRET);
  return new Request<unknown, IncomingRequestCfProperties>("https://bot.example/", {
    method,
    headers: { Authorization: `HMAC ${sig}`, "Content-Type": "application/json" },
    body: method === "GET" ? undefined : body,
  });
}

async function call(request: Request<unknown, IncomingRequestCfProperties>, testEnv: Env = env) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

let fetchSpy: MockInstance<typeof fetch>;
let logSpy: MockInstance<typeof console.log>;
let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("worker.fetch", () => {
  it("POST 외 메서드는 405", async () => {
    const res = await call(await signedRequest(raw, "GET"));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("서명이 틀리면 401, Notion 호출 없음", async () => {
    const req = new Request<unknown, IncomingRequestCfProperties>("https://bot.example/", {
      method: "POST",
      headers: { Authorization: "HMAC AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
      body: raw,
    });
    expect((await call(req)).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("성공 시 등록 메시지와 Notion 링크로 응답", async () => {
    fetchSpy.mockResolvedValue(Response.json({ object: "page", url: NOTION_URL }));

    const res = await call(await signedRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      type: "message",
      text: `✅ 등록됨: [로그인 버튼을 눌러도 반응이 없습니다](${NOTION_URL})`,
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/pages");
    expect(JSON.parse(init?.body as string).properties.유형).toEqual({ select: { name: "버그" } });
  });

  it("제목의 대괄호는 이스케이프", async () => {
    fetchSpy.mockResolvedValue(Response.json({ url: NOTION_URL }));
    const body = JSON.stringify({ ...fixture, text: "<at>봇</at> [개선] 목록 [정렬] 옵션" });

    const res = await call(await signedRequest(body));
    expect(((await res.json()) as { text: string }).text).toBe(`✅ 등록됨: [목록 \\[정렬\\] 옵션](${NOTION_URL})`);
  });

  it("Notion 오류면 200 + 안내 메시지 (에러 내용 노출 X)", async () => {
    fetchSpy.mockResolvedValue(
      Response.json({ object: "error", code: "unauthorized", message: "API token is invalid." }, { status: 401 }),
    );

    const res = await call(await signedRequest());
    expect(res.status).toBe(200);
    const { text } = (await res.json()) as { text: string };
    expect(text).toMatch(/^⚠️/);
    expect(text).not.toContain("unauthorized");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("status=401 code=unauthorized"));
  });

  it("JSON이 아닌 body(서명은 정상)면 200 + 안내 메시지", async () => {
    const res = await call(await signedRequest("not json"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toMatch(/^⚠️/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Notion이 4초 안에 끝나지 않으면 접수 중 응답 후 waitUntil로 계속 처리", async () => {
    vi.useFakeTimers();
    let resolveNotion!: (res: Response) => void;
    fetchSpy.mockReturnValue(new Promise<Response>((resolve) => (resolveNotion = resolve)));

    const ctx = createExecutionContext();
    const pending = worker.fetch(await signedRequest(), env, ctx);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(4000);

    const res = await pending;
    expect(((await res.json()) as { text: string }).text).toMatch(/^⏳ 접수 중/);

    resolveNotion(Response.json({ url: NOTION_URL }));
    await waitOnExecutionContext(ctx);
    expect(logSpy).toHaveBeenCalledWith(`지연 등록 완료: ${NOTION_URL}`);
  });

  it("DEBUG=true일 때만 raw payload를 로그", async () => {
    fetchSpy.mockResolvedValue(Response.json({ url: NOTION_URL }));

    await call(await signedRequest());
    expect(logSpy).not.toHaveBeenCalled();

    await call(await signedRequest(), { ...env, DEBUG: "true" });
    expect(logSpy).toHaveBeenCalledWith("[DEBUG] Teams payload:", raw);
    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain(env.TEAMS_HMAC_SECRET);
    expect(logged).not.toContain(env.NOTION_TOKEN);
  });
});
