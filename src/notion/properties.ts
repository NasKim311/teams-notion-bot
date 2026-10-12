import type { Issue } from "../types";
import { chunkText } from "./blocks";

// Notion DB 컬럼 이름(PROP)과 Issue ↔ 속성 변환.

export function plainText(content: string) {
  return [{ type: "text", text: { content: chunkText(content)[0] ?? "" } }];
}

/** Notion DB 컬럼 이름. DB에서 컬럼 이름을 바꾸면 여기만 바꾼다. "✏️ "는 DB 이름에 붙은 이모지 그대로다. */
export const PROP = {
  title: "제목",
  type: "✏️ 유형",
  author: "작성자",
  workItem: "레드마인 링크",
  mr: "MR 링크",
  branch: "✏️ 브랜치 명",
  files: "관련 파일",
  areas: "✏️ 영역",
  platform: "FO/BO",
  status: "✏️ 상태",
} as const;

/** PROP 각 컬럼의 Notion 타입. DB 싱크 점검(npm run notion:schema)에서 실제 스키마와 비교한다. */
export const PROP_TYPES: Record<keyof typeof PROP, string> = {
  title: "title",
  type: "select",
  author: "select",
  workItem: "url",
  mr: "url",
  branch: "rich_text",
  files: "rich_text",
  areas: "multi_select",
  platform: "select",
  status: "status",
};

const select = (name: string | null) => ({ select: name ? { name } : null });

/** Issue → Notion DB 속성. 작성자·유형·FO/BO는 select라 없는 이름이면 옵션이 새로 생긴다. */
export function buildProperties(issue: Issue) {
  return {
    [PROP.title]: { title: plainText(issue.title) },
    [PROP.type]: select(issue.type),
    [PROP.author]: select(issue.author),
    [PROP.workItem]: { url: issue.workItemUrl },
    [PROP.mr]: { url: issue.mrUrl },
    [PROP.branch]: { rich_text: issue.branch ? plainText(issue.branch) : [] },
    [PROP.files]: { rich_text: issue.files ? plainText(issue.files) : [] },
    [PROP.areas]: { multi_select: issue.areas.map((name) => ({ name })) },
    [PROP.platform]: select(issue.platform),
  };
}

export interface PageObject {
  id: string;
  url: string;
  properties: Record<string, { type: string; [key: string]: unknown }>;
}

type RichTextValue = { plain_text?: string }[];

export function readText(property: { [key: string]: unknown } | undefined): string {
  const items = (property?.title ?? property?.rich_text) as RichTextValue | undefined;
  return (items ?? []).map((item) => item.plain_text ?? "").join("");
}

const mergeList = (current: string, added: string) =>
  [...new Set([...current.split(","), ...added.split(",")].map((item) => item.trim()).filter(Boolean))].join(", ");

/** 업데이트 시 바꿀 속성: 상태, 비어 있던 레드마인/MR 링크·FO/BO, 브랜치 명·관련 파일·영역은 합친다. */
export function buildUpdateProperties(page: PageObject, issue: Issue, status: string | null) {
  const props = page.properties;
  const url = (name: string) => (props[name]?.url as string | null | undefined) ?? null;
  const areas = ((props[PROP.areas]?.multi_select as { name: string }[] | undefined) ?? []).map(
    (option) => option.name,
  );

  const update: Record<string, unknown> = {};
  if (status) update[PROP.status] = { status: { name: status } };
  for (const [name, value] of [
    [PROP.workItem, issue.workItemUrl],
    [PROP.mr, issue.mrUrl],
  ] as const) {
    if (value && !url(name) && name in props) update[name] = { url: value };
  }
  if (issue.platform && !props[PROP.platform]?.select && PROP.platform in props)
    update[PROP.platform] = select(issue.platform);
  for (const [name, value] of [
    [PROP.branch, issue.branch],
    [PROP.files, issue.files],
  ] as const) {
    if (!value || !(name in props)) continue;
    const merged = mergeList(readText(props[name]), value);
    if (merged !== readText(props[name])) update[name] = { rich_text: plainText(merged) };
  }
  const newAreas = issue.areas.filter((area) => !areas.includes(area));
  if (newAreas.length > 0 && PROP.areas in props)
    update[PROP.areas] = { multi_select: [...areas, ...newAreas].map((name) => ({ name })) };
  return update;
}
