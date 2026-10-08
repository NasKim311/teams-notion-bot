// 요청 본문 읽기와 공통 입력 검증 (크기 제한, JSON, 이미지 id 목록).

const REQUEST_MAX = 1_000_000;

export const PAGE_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

const IMAGES_MAX = 10;

/** 업로드된 이미지 id 목록 검증. 없으면 빈 배열, 형식이 틀리면 undefined. */
export function readImageIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > IMAGES_MAX) return undefined;
  return value.every((id) => typeof id === "string" && PAGE_ID.test(id)) ? (value as string[]) : undefined;
}

export async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > REQUEST_MAX) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
