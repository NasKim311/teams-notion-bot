// 페이지 본문 블록 ↔ 붙여넣기 형태 텍스트. retitle/restructure 스크립트가 함께 쓴다.
import { notion, plain, type RichText } from "./notion";

/** 봇이 만드는 블록 종류. 이 외의 블록이 있으면 사람이 손댄 페이지로 보고 본문을 다시 쓰지 않는다. */
const TEXT_TYPES = new Set(["paragraph", "heading_3", "code"]);
const KEEP_TYPES = new Set(["image"]);

export async function listChildren(blockId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(
      "GET",
      `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
    );
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

/** 블록 하나를 텍스트 줄로. 소제목은 대괄호 라벨("[ 이슈 사항 ]", "이슈 1)"), 회색 문단은 머리글("— …"). */
export function blockText(block: any): string | null {
  const richText: RichText[] | undefined = block[block.type]?.rich_text;
  if (!TEXT_TYPES.has(block.type) || !richText) return null;
  const text = plain(richText);
  if (block.type === "heading_3") {
    const numbered = text.match(/^이슈\s*(\d{1,2})$/);
    return numbered ? `이슈 ${numbered[1]})` : `[ ${text} ]`;
  }
  if (block.type === "paragraph" && richText[0]?.annotations?.color === "gray") return `— ${text}`;
  return text;
}

export const blocksToText = (blocks: any[]) =>
  blocks
    .map(blockText)
    .filter((text): text is string => text !== null)
    .join("\n\n");

export interface OriginalBody {
  /** 처음 등록된 본문 영역 (첫 구분선 앞, 업데이트 제외) */
  region: any[];
  /** 영역 안의 텍스트 블록 (다시 쓸 대상) */
  textBlocks: any[];
  text: string;
  /** 다시 쓰면 안 되는 이유 (봇이 만들지 않은 블록 등). 없으면 빈 배열 */
  problems: string[];
}

export async function readOriginalBody(pageId: string): Promise<OriginalBody> {
  const blocks = await listChildren(pageId);
  const end = blocks.findIndex((block) => block.type === "divider");
  const region = end === -1 ? blocks : blocks.slice(0, end);
  const textBlocks = region.filter((block) => TEXT_TYPES.has(block.type));
  const problems = region.flatMap((block) => {
    if (!TEXT_TYPES.has(block.type) && !KEEP_TYPES.has(block.type)) return [`봇이 만들지 않은 블록: ${block.type}`];
    if (block.has_children) return [`하위 블록이 있음: ${block.type}`];
    return [];
  });
  // 텍스트 블록은 이미지보다 앞에 모여 있어야 한다 (봇은 이미지를 본문 끝에 붙임)
  const firstImage = region.findIndex((block) => KEEP_TYPES.has(block.type));
  if (firstImage !== -1 && region.slice(firstImage).some((block) => TEXT_TYPES.has(block.type))) {
    problems.push("이미지 뒤에 글이 있음");
  }
  return { region, textBlocks, text: blocksToText(textBlocks), problems };
}
