// 본문에서 개발 정보를 뽑는다: 일감(Redmine), MR, 브랜치, 영역(모듈, 관련 파일 경로에서도), FO/BO.

import type { Platform } from "../types";

export interface DevInfo {
  workItemUrl: string | null;
  mrUrl: string | null;
  branch: string;
  areas: string[];
  platform: Platform | null;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'\])]+/g;
const REDMINE_URL = /https?:\/\/[^\s/]*redmine[^\s/]*\/issues\/(\d+)/i;
/** "일감 #879", "일감번호 8795": 키워드가 있으면 3~6자리 */
const WORK_ITEM_KEYWORD = /일감\s*(?:번호)?\s*[:：]?\s*#?\s*(\d{3,6})(?![\w])/g;
/** "#11661", "feature/x-#11661": "#"만 있으면 4~6자리 ("#999" 같은 색상 약식과 구분) */
const WORK_ITEM_HASH = /#(\d{4,6})(?![\w])/g;
/** 같은 줄에서 "#" 앞이 CSS 속성 값인지: "color: #333333", "box-shadow: 0 0 1px #999999, …" (B1) */
const CSS_VALUE_BEFORE = /(?:^|[;{])\s*[a-z-]+\s*:[^;{}]*[\s:,(]$/i;
const MR_URL = /https?:\/\/[^\s<>"'\])]*\/merge_requests\/\d+/;
const BRANCH = /(?<![\w/])(?:feature|bugfix|hotfix|release|fix|refactor)\/[\w.\-#/]+/g;
const FILE_PATH = /(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|vue|scss|css|less|json|html)(?![\w])/g;
const LINE_REF = /^\s*(?:의\s*)?(\d+)\s*(?:[~-]\s*(\d+))?\s*(?:번째\s*)?줄/;
const LINE_REF_ONLY = /^\s*(\d+)\s*(?:[~-]\s*(\d+))?\s*(?:번째\s*)?줄\s*$/;
/** 경로에 붙은 줄 번호: "Page.tsx:75", "List.tsx:103-119" */
const COLON_LINE_REF = /^:(\d+)(?:\s*[~-]\s*(\d+))?(?!\d)/;
/** 예시 괄호: "경로:줄 번호 (예: src/views/fit/FitPage.tsx:75)", "(예시: a/B.tsx)" — 안의 경로는 실제 파일이 아님 (B5) */
const EXAMPLE_NOTE = /\(\s*예(?:시)?\s*[:：)][^()]*\)/g;
const VIEW_MODULE = /(?:^|\/)views?\/([a-z][\w-]{1,20})(?:\/|$)/i;
// 영문자에 붙지 않은 대문자 FO/BO ("BO에서", "[BO]") 또는 한글 명칭
const PLATFORM = /(?<![A-Za-z])(FO|BO)(?![A-Za-z])|(프론트\s*오피스)|(백\s*오피스)/;
// "fit/fitBrandSearch": 페이지 이름이 모듈 이름으로 시작하는 경로
const MODULE_PAGE = /(?:^|[\s(])\/?([a-z]{2,10})\/\1[A-Z]\w*/;
const ROUTE_PAGE = /(?:^|\s)\/([a-z]{2,15})\/[\w/-]*\s*페이지/;

const MAX_FILES = 10;
const MAX_AREAS = 5;

const trimPunctuation = (text: string) => text.replace(/[.,;:!?)]+$/, "");

function lineSuffix(start?: string, end?: string): string {
  if (!start) return "";
  return end ? `:${start}-${end}` : `:${start}`;
}

/** 파일 경로와 바로 뒤(또는 다음 줄)의 줄 번호를 "경로:75" / "경로:103-119"로. */
export function extractFiles(text: string): string[] {
  const lines = text.replace(URL_PATTERN, " ").replace(EXAMPLE_NOTE, " ").split("\n");
  const seen = new Map<string, string>();

  lines.forEach((line, index) => {
    for (const match of line.matchAll(FILE_PATH)) {
      const path = match[0];
      if (seen.has(path)) continue;
      const after = line.slice((match.index ?? 0) + path.length);
      const sameLine = after.match(COLON_LINE_REF) ?? after.match(LINE_REF);
      const nextLine = after.trim() === "" ? (lines[index + 1] ?? "").match(LINE_REF_ONLY) : null;
      const ref = sameLine ?? nextLine;
      seen.set(path, `${path}${lineSuffix(ref?.[1], ref?.[2])}`);
    }
  });
  return [...seen.values()].slice(0, MAX_FILES);
}

export function extractAreas(text: string, files: string[]): string[] {
  const areas = new Set<string>();
  for (const file of files) {
    const module = file.match(VIEW_MODULE)?.[1];
    if (module) areas.add(module.toLowerCase());
  }
  for (const line of text.split("\n")) {
    const route = line.match(ROUTE_PAGE)?.[1] ?? line.match(MODULE_PAGE)?.[1];
    if (route) areas.add(route.toLowerCase());
  }
  return [...areas].slice(0, MAX_AREAS);
}

/** 일감 주소의 번호 부분: "…/issues/11661#note-3" → "11661" */
const ISSUE_NUMBER = /\/issues\/(\d+)(?!\d)/;

const issueUrl = (redmineIssueUrl: string, number: string) => `${redmineIssueUrl.replace(/\/?$/, "/")}${number}`;

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** 레드마인 일감 링크의 번호. 일감 주소가 아니면 null. */
export function workItemNumber(url: string): string | null {
  return url.match(ISSUE_NUMBER)?.[1] ?? null;
}

/**
 * 설정된 레드마인과 호스트가 같은 일감 링크는 표준 주소(기본 주소 + 번호)로 통일한다 (I11).
 * "https://…/issues/11661#note-3" → "http://…/issues/11661". 다른 호스트·일감이 아닌 주소는 그대로.
 */
export function normalizeWorkItemUrl(url: string | null, redmineIssueUrl?: string): string | null {
  if (!url || !redmineIssueUrl) return url;
  const number = workItemNumber(url);
  const host = hostOf(url);
  if (!number || !host || host !== hostOf(redmineIssueUrl)) return url;
  return issueUrl(redmineIssueUrl, number);
}

/** Redmine 일감 URL. 본문에 URL이 없으면 "#11661", "일감번호 8795"를 기본 주소로 이어 붙인다. */
export function extractWorkItem(text: string, redmineIssueUrl?: string): string | null {
  const url = text.match(REDMINE_URL)?.[0];
  if (url) return normalizeWorkItemUrl(url, redmineIssueUrl);

  const number = findWorkItemNumber(text.replace(URL_PATTERN, " "));
  if (!number || !redmineIssueUrl) return null;
  return issueUrl(redmineIssueUrl, number);
}

/** 본문에서 처음 나온 일감 번호. CSS 색상 코드("#333333")는 건너뛴다. */
function findWorkItemNumber(text: string): string | undefined {
  const isCssValue = (index: number) => {
    const lineStart = text.lastIndexOf("\n", index) + 1;
    return CSS_VALUE_BEFORE.test(text.slice(lineStart, index));
  };
  const candidates = [
    ...[...text.matchAll(WORK_ITEM_KEYWORD)].map((m) => ({ index: m.index, number: m[1] })),
    ...[...text.matchAll(WORK_ITEM_HASH)]
      .filter((m) => !isCssValue(m.index))
      .map((m) => ({ index: m.index, number: m[1] })),
  ];
  return candidates.sort((a, b) => a.index - b.index)[0]?.number;
}

/** 처음 나온 FO/BO 언급. URL 안의 글자(예: ".bo.")는 보지 않는다. */
export function extractPlatform(text: string): Platform | null {
  const match = text.replace(URL_PATTERN, " ").match(PLATFORM);
  if (!match) return null;
  if (match[1]) return match[1] as Platform;
  return match[2] ? "FO" : "BO";
}

export function extractDevInfo(text: string, redmineIssueUrl?: string): DevInfo {
  const branches = [...new Set([...text.replace(URL_PATTERN, " ").matchAll(BRANCH)].map((m) => trimPunctuation(m[0])))];

  return {
    workItemUrl: extractWorkItem(text, redmineIssueUrl),
    mrUrl: text.match(MR_URL)?.[0] ?? null,
    branch: branches.join(", "),
    areas: extractAreas(text, extractFiles(text)),
    platform: extractPlatform(text),
  };
}
