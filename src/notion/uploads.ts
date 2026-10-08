import { NOTION_API, NOTION_VERSION, type NotionEnv, NotionError, notionRequest, readErrorCode } from "./client";

// 스크린샷을 Notion 파일 업로드로 올린다.

/**
 * Notion 파일 업로드: 업로드 객체 생성 → multipart로 파일 전송 → id 반환.
 * 반환된 id는 1시간 안에 이미지 블록으로 붙여야 한다.
 */
export async function uploadImage(file: File, env: NotionEnv, fetchImpl: typeof fetch = fetch): Promise<string> {
  const filename = file.name || "screenshot.png";
  const created = await notionRequest<{ id?: unknown }>(
    env,
    "POST",
    "/file_uploads",
    { filename, content_type: file.type },
    fetchImpl,
  );
  if (typeof created.id !== "string") throw new NotionError(200, "missing_upload_id");

  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetchImpl(`${NOTION_API}/file_uploads/${created.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  if (!res.ok) throw new NotionError(res.status, await readErrorCode(res));
  return created.id;
}
