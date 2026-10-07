import { UNKNOWN_AUTHOR } from "./parse";
import { ISSUE_TYPES, type Issue, type IssueType } from "./types";

// 사용자가 미리보기에서 수정해 보낸 값을 검증한다.

const TITLE_MAX = 200;
const AUTHOR_MAX = 100;
const URL_MAX = 2000;
export const BODY_MAX = 200_000; // Notion 요청당 100블록 × 2000자

export type ValidationResult = { ok: true; issue: Issue } | { ok: false; error: string };

const length = (text: string) => Array.from(text).length;

function isIssueType(value: unknown): value is IssueType {
  return typeof value === "string" && (ISSUE_TYPES as readonly string[]).includes(value);
}

function normalizeUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > URL_MAX) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function validateIssue(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "요청 형식이 올바르지 않습니다." };
  const data = input as Record<string, unknown>;

  const title = typeof data.title === "string" ? data.title.replace(/\s+/g, " ").trim() : "";
  if (title === "") return { ok: false, error: "제목을 입력해주세요." };
  if (length(title) > TITLE_MAX) return { ok: false, error: `제목은 ${TITLE_MAX}자 이하로 입력해주세요.` };

  if (!isIssueType(data.type)) return { ok: false, error: "유형이 올바르지 않습니다." };

  const author = typeof data.author === "string" ? data.author.trim() : "";
  if (length(author) > AUTHOR_MAX) return { ok: false, error: `작성자는 ${AUTHOR_MAX}자 이하로 입력해주세요.` };

  const sourceUrl = normalizeUrl(data.sourceUrl);
  if (sourceUrl === undefined) return { ok: false, error: "원문 링크는 http(s) 주소여야 합니다." };

  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (body.length > BODY_MAX) return { ok: false, error: "본문이 너무 깁니다." };

  return {
    ok: true,
    issue: { title, type: data.type, author: author || UNKNOWN_AUTHOR, sourceUrl, body },
  };
}
