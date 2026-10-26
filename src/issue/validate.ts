import { ISSUE_TYPES, type Issue, type IssueType, PLATFORMS, type Platform } from "../types";
import { UNKNOWN_AUTHOR } from "./header";

// 사용자가 미리보기에서 수정해 보낸 값을 검증한다.

const TITLE_MAX = 200;
const AUTHOR_MAX = 100;
const URL_MAX = 2000;
const TEXT_FIELD_MAX = 2000;
const AREA_MAX = 50;
const AREAS_MAX = 10;
export const BODY_MAX = 200_000;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const length = (text: string) => Array.from(text).length;
const fail = (error: string) => ({ ok: false as const, error });

function isIssueType(value: unknown): value is IssueType {
  return typeof value === "string" && (ISSUE_TYPES as readonly string[]).includes(value);
}

/** 빈 값 → null, FO/BO → 그대로, 그 외 → undefined(오류) */
function normalizePlatform(value: unknown): Platform | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value)
    ? (value as Platform)
    : undefined;
}

/** 빈 값 → null, http(s) URL → 문자열, 그 외 → undefined(오류) */
export function normalizeUrl(value: unknown): string | null | undefined {
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

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return length(text) > TEXT_FIELD_MAX ? undefined : text;
}

function normalizeAreas(value: unknown): string[] | undefined {
  const raw = typeof value === "string" ? value.split(",") : (value ?? []);
  if (!Array.isArray(raw)) return undefined;
  const areas = [...new Set(raw.map((area) => (typeof area === "string" ? area.trim() : "")).filter(Boolean))];
  if (areas.length > AREAS_MAX || areas.some((area) => length(area) > AREA_MAX || area.includes(","))) return undefined;
  return areas;
}

export function validateIssue(input: unknown): ValidationResult<Issue> {
  if (typeof input !== "object" || input === null) return fail("요청 형식이 올바르지 않습니다.");
  const data = input as Record<string, unknown>;

  const title = typeof data.title === "string" ? data.title.replace(/\s+/g, " ").trim() : "";
  if (title === "") return fail("제목을 입력해주세요.");
  if (length(title) > TITLE_MAX) return fail(`제목은 ${TITLE_MAX}자 이하로 입력해주세요.`);

  if (!isIssueType(data.type)) return fail("유형이 올바르지 않습니다.");

  // 작성자는 Notion select 옵션이라 쉼표를 쓸 수 없다.
  const author = typeof data.author === "string" ? data.author.replace(/,/g, " ").replace(/\s+/g, " ").trim() : "";
  if (length(author) > AUTHOR_MAX) return fail(`작성자는 ${AUTHOR_MAX}자 이하로 입력해주세요.`);

  const platform = normalizePlatform(data.platform);
  if (platform === undefined) return fail("FO/BO 값이 올바르지 않습니다.");

  const workItemUrl = normalizeUrl(data.workItemUrl);
  if (workItemUrl === undefined) return fail("레드마인 링크는 http(s) 주소여야 합니다.");
  const mrUrl = normalizeUrl(data.mrUrl);
  if (mrUrl === undefined) return fail("MR 링크는 http(s) 주소여야 합니다.");

  const branch = optionalText(data.branch);
  if (branch === undefined) return fail("브랜치 명이 너무 깁니다.");
  const areas = normalizeAreas(data.areas);
  if (areas === undefined) return fail(`영역은 ${AREAS_MAX}개 이하, 각 ${AREA_MAX}자 이하로 입력해주세요.`);

  const body = typeof data.body === "string" ? data.body.trim() : "";
  if (body.length > BODY_MAX) return fail("본문이 너무 깁니다.");

  return {
    ok: true,
    value: {
      title,
      type: data.type,
      author: author || UNKNOWN_AUTHOR,
      platform,
      body,
      workItemUrl,
      mrUrl,
      branch,
      areas,
    },
  };
}
