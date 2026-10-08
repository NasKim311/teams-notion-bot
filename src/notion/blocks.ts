import { isCodeLine, matchSectionLabel } from "../issue/sections";
import { HEADER_MARK, isHeaderLine } from "../issue/text";

// 본문 텍스트 → Notion 블록.
//   섹션 라벨 → 소제목(heading_3), 코드 줄 묶음 → 코드 블록, "— 이름 · 시간" → 회색 굵은 줄,
//   그 외 → 문단. URL은 링크로 만든다.

export const TEXT_LIMIT = 2000; // rich_text 한 덩어리 최대 길이
const URL_IN_TEXT = /https?:\/\/[^\s<>"'\])]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

export interface RichText {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: { bold?: boolean; color?: string };
}

export type NotionBlock = { object: "block"; type: string; [key: string]: unknown };

/**
 * 텍스트를 최대 2000자 단위로 나눈다.
 * 코드포인트(서로게이트 쌍)를 쪼개지 않으면서 UTF-16 길이 기준으로도 한도를 넘지 않게 한다.
 */
export function chunkText(text: string, size = TEXT_LIMIT): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const ch of text) {
    if (current.length + ch.length > size) {
      chunks.push(current);
      current = "";
    }
    current += ch;
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

function textPart(content: string, url?: string, annotations?: RichText["annotations"]): RichText[] {
  return chunkText(content).map((chunk) => ({
    type: "text",
    text: url ? { content: chunk, link: { url } } : { content: chunk },
    ...(annotations ? { annotations } : {}),
  }));
}

/** 호스트가 있는 http(s) 주소인지 */
function isLinkableUrl(url: string): boolean {
  try {
    return new URL(url).hostname !== "";
  } catch {
    return false;
  }
}

/** 텍스트를 rich_text 배열로. URL 부분은 링크가 된다. */
export function richText(text: string, annotations?: RichText["annotations"]): RichText[] {
  const parts: RichText[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    // 주소로 해석되지 않으면("http://..." 같은 자리표시) 링크로 만들지 않는다. Notion이 등록 전체를 거부한다 (B2)
    if (!isLinkableUrl(url)) continue;
    const index = match.index ?? 0;
    if (index > last) parts.push(...textPart(text.slice(last, index), undefined, annotations));
    parts.push(...textPart(url, url, annotations));
    last = index + url.length;
  }
  if (last < text.length) parts.push(...textPart(text.slice(last), undefined, annotations));
  return parts;
}

function paragraphs(text: string): NotionBlock[] {
  return chunkText(text).map((chunk) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(chunk) },
  }));
}

function heading(label: string): NotionBlock {
  return { object: "block", type: "heading_3", heading_3: { rich_text: richText(label) } };
}

function codeBlock(code: string): NotionBlock {
  return {
    object: "block",
    type: "code",
    code: { language: "typescript", rich_text: textPart(code) },
  };
}

function authorLine(text: string): NotionBlock {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(text, { bold: true, color: "gray" }) },
  };
}

/** Notion에 업로드한 파일(file_upload id)을 이미지 블록으로. */
export function imageBlocks(uploadIds: string[]): NotionBlock[] {
  return uploadIds.map((id) => ({
    object: "block",
    type: "image",
    image: { type: "file_upload", file_upload: { id } },
  }));
}

export function toBlocks(body: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  let paragraph: string[] = [];
  let code: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push(...paragraphs(paragraph.join("\n")));
    paragraph = [];
  };
  const flushCode = () => {
    if (code.length > 0) blocks.push(codeBlock(code.join("\n")));
    code = [];
  };

  for (const line of body.split("\n")) {
    if (isCodeLine(line)) {
      flushParagraph();
      code.push(line);
      continue;
    }
    flushCode();

    if (line.trim() === "") {
      flushParagraph();
    } else if (isHeaderLine(line)) {
      flushParagraph();
      blocks.push(authorLine(line.slice(HEADER_MARK.length)));
    } else {
      const section = matchSectionLabel(line);
      if (section) {
        flushParagraph();
        blocks.push(heading(section.label));
        if (section.rest) paragraph.push(section.rest);
      } else {
        paragraph.push(line);
      }
    }
  }
  flushParagraph();
  flushCode();
  return blocks;
}
