import type { Issue, IssueType, TeamsPayload } from "./types";

const TITLE_MAX = 50;
const UNTITLED = "(제목 없음)";
const UNKNOWN_AUTHOR = "알 수 없음";

const MENTION = /<at\b[^>]*>[\s\S]*?<\/at>/gi;
const LINE_BREAK_TAG = /<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi;
const ANY_TAG = /<[^>]*>/g;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

// [운영]은 키워드 없이 태그로만 분류한다.
const TYPE_TAG = /\[(버그|개선|운영)\]/;
const TYPE_TAG_ALL = /\[(?:버그|개선|운영)\]/g;
const BUG_KEYWORDS = /버그|에러|안됨/;
const IMPROVEMENT_KEYWORDS = /개선|제안/;

const CONVERSATION_ID = /^(19:[^;]+)(?:;messageid=(\d+))?$/;
const MESSAGE_ID = /^\d+$/;

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, name: string) => {
    if (name.startsWith("#")) {
      const hex = name[1] === "x" || name[1] === "X";
      const code = hex ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** 멘션·HTML 태그를 제거하고 엔티티를 디코딩한 평문을 만든다. */
export function cleanText(html: string): string {
  const text = decodeEntities(
    html.replace(MENTION, "").replace(LINE_BREAK_TAG, "\n").replace(ANY_TAG, ""),
  );
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** [버그]/[개선]/[운영] 태그 우선, 없으면 키워드로 유형을 분류한다. */
export function classify(text: string): IssueType {
  const tag = text.match(TYPE_TAG)?.[1];
  if (tag === "버그" || tag === "개선" || tag === "운영") return tag;
  if (BUG_KEYWORDS.test(text)) return "버그";
  if (IMPROVEMENT_KEYWORDS.test(text)) return "개선";
  return "기타";
}

/** 첫 번째 비어있지 않은 줄에서 유형 태그를 뺀 뒤 최대 50자로 자른다. */
export function makeTitle(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
  const title = firstLine.replace(TYPE_TAG_ALL, "").replace(/\s+/g, " ").trim();
  if (title === "") return UNTITLED;

  const chars = Array.from(title);
  return chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX - 1).join("") + "…" : title;
}

/** 채널 메시지 딥링크를 만든다. 필요한 값이 없으면 null. */
export function buildMessageLink(payload: TeamsPayload): string | null {
  const conversationId = payload.conversation?.id;
  const messageId = payload.id;
  if (typeof conversationId !== "string" || typeof messageId !== "string") return null;
  if (!MESSAGE_ID.test(messageId)) return null;

  const match = conversationId.match(CONVERSATION_ID);
  const channelId = match?.[1];
  if (!match || !channelId) return null;

  const params = new URLSearchParams();
  const tenantId = payload.conversation?.tenantId ?? payload.channelData?.tenant?.id;
  if (typeof tenantId === "string" && tenantId !== "") params.set("tenantId", tenantId);
  params.set("parentMessageId", match[2] ?? messageId);

  return `https://teams.microsoft.com/l/message/${encodeURIComponent(channelId)}/${messageId}?${params}`;
}

export function parseTeamsMessage(payload: TeamsPayload): Issue {
  const body = cleanText(typeof payload.text === "string" ? payload.text : "");
  const name = payload.from?.name;

  return {
    title: makeTitle(body),
    type: classify(body),
    body,
    author: typeof name === "string" && name.trim() !== "" ? name.trim() : UNKNOWN_AUTHOR,
    sourceUrl: buildMessageLink(payload),
  };
}
