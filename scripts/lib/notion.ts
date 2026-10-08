// 로컬 스크립트용 Notion 호출 도우미. .dev.vars의 NOTION_TOKEN/NOTION_DATABASE_ID를 쓰고, 비밀값은 출력하지 않는다.
import { readFileSync } from "node:fs";

function readDevVars(): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(".dev.vars", "utf8");
  } catch {
    throw new Error(".dev.vars 파일이 없습니다. 저장소 루트에서 실행하고 .dev.vars.example을 참고해 만들어주세요.");
  }
  const vars: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match?.[1]) vars[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return vars;
}

const vars = readDevVars();
export const DATABASE_ID = vars.NOTION_DATABASE_ID ?? "";
const TOKEN = vars.NOTION_TOKEN ?? "";
if (!TOKEN || !DATABASE_ID) throw new Error(".dev.vars에 NOTION_TOKEN과 NOTION_DATABASE_ID가 필요합니다.");

/** Notion API 호출. 실패하면 status/code만 담은 오류를 던진다. */
export async function notion<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // 요청이 많으면(429) Retry-After만큼 기다렸다가 다시 시도
    if (res.status === 429 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, Number(res.headers.get("Retry-After") ?? 1) * 1000));
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as { code?: string };
    if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status} ${data.code ?? ""}`);
    return data as T;
  }
}

/** Notion에서 읽은 rich_text(plain_text) 또는 우리가 만든 블록(text.content) 모두 지원 */
export type RichText = { plain_text?: string; text?: { content: string }; annotations?: { color?: string } };
export const plain = (items: RichText[] = []) => items.map((item) => item.plain_text ?? item.text?.content ?? "").join("");

/** DB의 모든 페이지 (100개씩 이어서 조회) */
export async function queryAllPages(): Promise<any[]> {
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion("POST", `/databases/${DATABASE_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}
