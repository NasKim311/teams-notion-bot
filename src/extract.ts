// 본문에서 개발 정보를 뽑는다: 일감(Redmine), MR, 브랜치, 관련 파일(+줄 번호), 영역(모듈), FO/BO.

import type { Platform } from "./types";

export interface DevInfo {
  workItemUrl: string | null;
  mrUrl: string | null;
  branch: string;
  files: string;
  areas: string[];
  platform: Platform | null;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'\])]+/g;
const REDMINE_URL = /https?:\/\/[^\s/]*redmine[^\s/]*\/issues\/(\d+)/i;
const WORK_ITEM_NUMBER = /(?:일감\s*(?:번호)?\s*[:：]?\s*#?\s*|#)(\d{3,6})(?![\w])/;
const MR_URL = /https?:\/\/[^\s<>"'\])]*\/merge_requests\/\d+/;
const BRANCH = /(?<![\w/])(?:feature|bugfix|hotfix|release|fix|refactor)\/[\w.\-#/]+/g;
const FILE_PATH = /(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|mjs|cjs|vue|scss|css|less|json|html)(?![\w])/g;
const LINE_REF = /^\s*(?:의\s*)?(\d+)\s*(?:[~-]\s*(\d+))?\s*(?:번째\s*)?줄/;
const LINE_REF_ONLY = /^\s*(\d+)\s*(?:[~-]\s*(\d+))?\s*(?:번째\s*)?줄\s*$/;
const VIEW_MODULE = /(?:^|\/)views?\/([a-z][\w-]{1,20})(?:\/|$)/i;
// 영문자에 붙지 않은 대문자 FO/BO ("BO에서", "[BO]") 또는 한글 명칭
const PLATFORM = /(?<![A-Za-z])(FO|BO)(?![A-Za-z])|(프론트\s*오피스)|(백\s*오피스)/;
// "fit/fitBrandSearch": 페이지 이름이 모듈 이름으로 시작하는 경로
const MODULE_PAGE = /(?:^|[\s(])\/?([a-z]{2,10})\/\1[A-Z]\w*/;
const ROUTE_PAGE =/(?:^|\s)\/([a-z]{2,15})\/[\w/-]*\s*페이지/;

const MAX_FILES = 10;
const MAX_AREAS = 5;

const trimPunctuation = (text: string) => text.replace(/[.,;:!?)]+$/, "");

function lineSuffix(start?: string, end?: string): string {
  if (!start) return "";
  return end ? `:${start}-${end}` : `:${start}`;
}

/** 파일 경로와 바로 뒤(또는 다음 줄)의 줄 번호를 "경로:75" / "경로:103-119"로. */
export function extractFiles(text: string): string[] {
  const lines = text.replace(URL_PATTERN, " ").split("\n");
  const seen = new Map<string, string>();

  lines.forEach((line, index) => {
    for (const match of line.matchAll(FILE_PATH)) {
      const path = match[0];
      if (seen.has(path)) continue;
      const after = line.slice((match.index ?? 0) + path.length);
      const sameLine = after.match(LINE_REF);
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

/** Redmine 일감 URL. 본문에 URL이 없으면 "#11661", "일감번호 8795"를 기본 주소로 이어 붙인다. */
export function extractWorkItem(text: string, redmineIssueUrl?: string): string | null {
  const url = text.match(REDMINE_URL)?.[0];
  if (url) return url;

  const number = text.replace(URL_PATTERN, " ").match(WORK_ITEM_NUMBER)?.[1];
  if (!number || !redmineIssueUrl) return null;
  return `${redmineIssueUrl.replace(/\/?$/, "/")}${number}`;
}

/** 처음 나온 FO/BO 언급. URL 안의 글자(예: ".bo.")는 보지 않는다. */
export function extractPlatform(text: string): Platform | null {
  const match = text.replace(URL_PATTERN, " ").match(PLATFORM);
  if (!match) return null;
  if (match[1]) return match[1] as Platform;
  return match[2] ? "FO" : "BO";
}

export function extractDevInfo(text: string, redmineIssueUrl?: string): DevInfo {
  const files = extractFiles(text);
  const branches = [...new Set([...text.replace(URL_PATTERN, " ").matchAll(BRANCH)].map((m) => trimPunctuation(m[0])))];

  return {
    workItemUrl: extractWorkItem(text, redmineIssueUrl),
    mrUrl: text.match(MR_URL)?.[0] ?? null,
    branch: branches.join(", "),
    files: files.join(", "),
    areas: extractAreas(text, files),
    platform: extractPlatform(text),
  };
}
