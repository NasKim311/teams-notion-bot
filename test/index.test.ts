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

const PAGE_ID = "11111111-2222-3333-4444-555555555555";
const EXISTING = {
  id: PAGE_ID,
  url: "https://www.notion.so/existing",
  properties: {
    제목: { type: "title", title: [{ plain_text: "기존 이슈" }] },
    상태: { type: "status", status: { name: "진행 중" } },
  },
};
const STATUS_SCHEMA = {
  properties: {
    상태: {
      type: "status",
      status: {
        options: [
          { id: "s1", name: "시작 전" },
          { id: "s2", name: "진행 중" },
          { id: "s3", name: "완료" },
        ],
        groups: [{ option_ids: ["s1"] }, { option_ids: ["s2"] }, { option_ids: ["s3"] }],
      },
    },
  },
};

/** Notion API 흉내: DB 조회/검색/페이지 생성·조회·수정/블록 추가 */
function mockNotion(results: unknown[] = []) {
  fetchSpy.mockImplementation(async (input, init) => {
    const url = String(input).replace("https://api.notion.com/v1", "");
    const method = init?.method ?? "GET";
    if (url.endsWith("/query")) return Response.json({ results });
    if (url.startsWith("/databases/")) return Response.json(STATUS_SCHEMA);
    if (url.endsWith("/children")) return Response.json({});
    if (url === "/pages" && method === "POST") return Response.json({ id: "page-1", url: NOTION_URL });
    if (url.startsWith("/pages/")) return Response.json(EXISTING);
    return new Response("unexpected", { status: 500 });
  });
}

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
  it("붙여넣은 텍스트를 Issue 초안으로 돌려준다 (기존 이슈 없음)", async () => {
    mockNotion([]);
    const res = await call(
      post("/api/preview", { text: `[버그] 저장 실패\n작성자: 홍길동\n${LINK}\n브랜치명: feature/fix-#11660\n상세` }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      splittable: false,
      issues: [
        {
          title: "저장 실패",
          type: "버그",
          author: "홍길동",
          sourceUrl: LINK,
          body: "[버그] 저장 실패\n브랜치명: feature/fix-#11660\n상세",
          workItemUrl: "http://redmine.example.com/issues/11660", // REDMINE_ISSUE_URL + 번호
          mrUrl: null,
          branch: "feature/fix-#11660",
          files: "",
          areas: [],
        },
      ],
      lookups: [{ matches: [], suggestedStatus: "진행 중" }], // "브랜치명:" → 진행 중 추천
      statusOptions: ["시작 전", "진행 중", "완료"],
    });
  });

  it("같은 일감의 기존 이슈를 찾아 알려준다", async () => {
    mockNotion([EXISTING]);
    const res = await call(post("/api/preview", { text: "http://redmine.example.com/issues/1\n수정하여 전달드립니다." }));
    const data = (await res.json()) as { lookups: unknown[] };
    expect(data.lookups).toEqual([
      {
        matches: [{ id: PAGE_ID, url: "https://www.notion.so/existing", title: "기존 이슈", status: "진행 중" }],
        suggestedStatus: "완료",
      },
    ]);
  });

  it("단서(일감/원문 링크)가 없으면 Notion을 조회하지 않는다", async () => {
    const data = (await (await call(post("/api/preview", { text: "그냥 문장" }))).json()) as Record<string, unknown>;
    expect(data).toMatchObject({ lookups: [{ matches: [], suggestedStatus: null }], statusOptions: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("기존 이슈 조회가 실패해도 미리보기는 된다", async () => {
    fetchSpy.mockResolvedValue(Response.json({ code: "restricted_resource" }, { status: 403 }));
    const res = await call(post("/api/preview", { text: `${LINK}\n내용` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ lookupError: expect.stringContaining("새 이슈로만") });
  });

  it("여러 이슈는 나눠서, split: false면 하나로", async () => {
    const text = "이슈 1)\nA 문제\n이슈 2)\nB 문제";
    const split = (await (await call(post("/api/preview", { text }))).json()) as { issues: unknown[]; splittable: boolean };
    expect(split).toMatchObject({ splittable: true });
    expect(split.issues).toHaveLength(2);

    const merged = (await (await call(post("/api/preview", { text, split: false }))).json()) as { issues: unknown[] };
    expect(merged.issues).toHaveLength(1);
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
    fetchSpy.mockResolvedValue(Response.json({ object: "page", id: "page-1", url: NOTION_URL }));

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

describe("POST /api/issues/update", () => {
  const issue = { title: "후속", type: "버그", author: "김개발", sourceUrl: null, body: "수정 완료" };

  it("기존 페이지에 업데이트를 붙이고 url을 돌려준다", async () => {
    mockNotion();
    const res = await call(post("/api/issues/update", { pageId: PAGE_ID, issue, status: "완료" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://www.notion.so/existing" });

    const calls = fetchSpy.mock.calls.map(([u, init]) => `${init?.method} ${String(u).replace("https://api.notion.com/v1", "")}`);
    expect(calls).toEqual([`GET /pages/${PAGE_ID}`, `PATCH /blocks/${PAGE_ID}/children`, `PATCH /pages/${PAGE_ID}`]);
  });

  it.each<[string, unknown, string]>([
    ["pageId 형식 오류", { pageId: "../databases/x", issue, status: null }, "기존 이슈"],
    ["상태 타입 오류", { pageId: PAGE_ID, issue, status: 3 }, "상태"],
    ["이슈 검증 실패", { pageId: PAGE_ID, issue: { ...issue, title: "" }, status: null }, "제목"],
  ])("%s → 400", async (_label, body, message) => {
    const res = await call(post("/api/issues/update", body));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Notion 권한 부족 → 502 + 안내", async () => {
    fetchSpy.mockResolvedValue(Response.json({ code: "restricted_resource" }, { status: 403 }));
    const res = await call(post("/api/issues/update", { pageId: PAGE_ID, issue, status: null }));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("권한");
  });
});

describe("POST /api/uploads", () => {
  const UPLOAD_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  function upload(file: Blob | null, name = "shot.png", password?: string | null) {
    const form = new FormData();
    if (file) form.append("file", file, name);
    const headers = new Headers();
    if (password !== null) headers.set("Authorization", `Bearer ${encodeURIComponent(password ?? env.FORM_PASSWORD)}`);
    return new Request<unknown, IncomingRequestCfProperties>("https://bot.example/api/uploads", { method: "POST", body: form, headers });
  }

  it("Notion에 업로드하고 id를 돌려준다", async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith("/send") ? Response.json({ status: "uploaded" }) : Response.json({ id: UPLOAD_ID, status: "pending" }),
    );
    const res = await call(upload(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: UPLOAD_ID });

    const [createUrl, createInit] = fetchSpy.mock.calls[0]!;
    expect(createUrl).toBe("https://api.notion.com/v1/file_uploads");
    expect(JSON.parse(createInit?.body as string)).toEqual({ filename: "shot.png", content_type: "image/png" });
    const [sendUrl, sendInit] = fetchSpy.mock.calls[1]!;
    expect(sendUrl).toBe(`https://api.notion.com/v1/file_uploads/${UPLOAD_ID}/send`);
    expect(sendInit?.body).toBeInstanceOf(FormData);
  });

  it.each<[string, () => CfRequest, string]>([
    ["이미지가 아닌 파일", () => upload(new Blob(["x"], { type: "text/plain" }), "a.txt"), "이미지만"],
    ["5MB 초과", () => upload(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" })), "5MB"],
    ["파일 없음", () => upload(null), "이미지 파일"],
    ["multipart 아님", () => post("/api/uploads", { file: "x" }), "이미지 파일"],
  ])("%s → 400", async (_label, makeRequest, message) => {
    const res = await call(makeRequest());
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("비밀번호가 없으면 401", async () => {
    expect((await call(upload(new Blob(["x"], { type: "image/png" }), "a.png", null))).status).toBe(401);
  });
});

describe("스크린샷 첨부", () => {
  const IMAGE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const issue = { title: "화면 깨짐", type: "버그", author: "김개발", sourceUrl: null, body: "본문" };

  it("새 이슈 본문 끝에 이미지 블록", async () => {
    mockNotion();
    expect((await call(post("/api/issues", { ...issue, imageIds: [IMAGE_ID] }))).status).toBe(201);
    const children = JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string).children;
    expect(children.at(-1)).toEqual({
      object: "block",
      type: "image",
      image: { type: "file_upload", file_upload: { id: IMAGE_ID } },
    });
  });

  it("업데이트에도 이미지 블록", async () => {
    mockNotion();
    await call(post("/api/issues/update", { pageId: PAGE_ID, issue, status: null, imageIds: [IMAGE_ID] }));
    const children = JSON.parse(fetchSpy.mock.calls[1]![1]?.body as string).children;
    expect(children.at(-1).type).toBe("image");
  });

  it.each([[["not-an-id"]], ["x"], [Array.from({ length: 11 }, () => IMAGE_ID)]])("잘못된 imageIds %# → 400", async (imageIds) => {
    const res = await call(post("/api/issues", { ...issue, imageIds }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
