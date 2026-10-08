import type { Issue } from "../types";
import { classify } from "./classify";
import { extractDevInfo } from "./extract";
import { personName, rewriteHeaders, UNKNOWN_AUTHOR } from "./header";
import { splitIssueLines } from "./split";
import { normalizeText } from "./text";
import { cleanTitle, makeIssueTitle, withScope } from "./title";

// 붙여넣은 Teams 대화 텍스트 → Issue 초안 (각 모듈을 조립한다).
// 필드 줄이 있으면 우선 쓰고, 없으면 Teams 복사 형식에서 추정한다.
//
//   제목: [버그] 한 줄 요약   (없으면 title.ts 규칙으로 자동 생성)
//   작성자: 홍길동            (없으면 Teams 머리글에서)
//   본문...
// Teams 메시지 링크(링크:/원문: 줄, 링크만 있는 줄)는 저장하지 않고 본문에서 뺀다.

const FIELD_LINE = /^(제목|작성자|원문 링크|원문|링크)\s*[:：]\s*(.*)$/;
const TEAMS_LINK = /^https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)\/l\/message\/[^\s<>"'\])]+$/;

export interface ParseOptions {
  /** Redmine 일감 주소 접두어 */
  redmineIssueUrl?: string;
}

interface Prepared {
  title?: string;
  author?: string;
  /** 필드 줄을 빼고 머리글을 한 줄로 정리한 본문 줄 */
  lines: string[];
}

/** 필드 줄(제목/작성자/링크)과 Teams 머리글을 처리한다. */
function prepare(raw: string): Prepared {
  const text = normalizeText(raw);

  let title: string | undefined;
  let author: string | undefined;
  const bodyLines: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const field = trimmed.match(FIELD_LINE);
    if (field) {
      const [, key, value = ""] = field;
      if (key === "제목") title ??= value.trim() || undefined;
      else if (key === "작성자") author ??= value.trim() || undefined;
      continue;
    }
    if (TEAMS_LINK.test(trimmed)) continue;
    bodyLines.push(line);
  }

  const rewritten = rewriteHeaders(bodyLines);
  return { title, author: author ?? rewritten.author, lines: rewritten.lines };
}

function buildIssue(lines: string[], prepared: Prepared, options: ParseOptions): Issue {
  const body = normalizeText(lines.join("\n"));
  const { title } = prepared;
  const devInfo = extractDevInfo(`${title ?? ""}\n${body}`, options.redmineIssueUrl);

  return {
    title: title ? cleanTitle(title) : withScope(devInfo.areas[0] ?? devInfo.platform, makeIssueTitle(lines)),
    type: classify(`${title ?? ""}\n${body}`),
    body,
    author: prepared.author ? personName(prepared.author) : UNKNOWN_AUTHOR,
    ...devInfo,
  };
}

export function parsePastedText(raw: string, options: ParseOptions = {}): Issue {
  const prepared = prepare(raw);
  return buildIssue(prepared.lines, prepared, options);
}

/** 여러 이슈로 나눌 수 있는지 확인하고, split이면 나눠서 돌려준다. 제목: 필드가 있으면 나누지 않는다. */
export function parseIssues(
  raw: string,
  options: ParseOptions & { split?: boolean } = {},
): { issues: Issue[]; splittable: boolean } {
  const prepared = prepare(raw);
  const chunks = prepared.title ? null : splitIssueLines(prepared.lines);
  if (!chunks || options.split === false) {
    return { issues: [buildIssue(prepared.lines, prepared, options)], splittable: chunks !== null };
  }
  return { issues: chunks.map((chunk) => buildIssue(chunk, prepared, options)), splittable: true };
}
