import { logError } from "../http/log";
import { json, jsonError } from "../http/response";
import { notionErrorMessage } from "../notion/client";
import { uploadImage } from "../notion/uploads";
import type { Env } from "../types";

// POST /api/uploads: 스크린샷을 Notion에 올리고 업로드 id를 돌려준다.

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  if (!(request.headers.get("Content-Type") ?? "").startsWith("multipart/form-data")) {
    return jsonError(400, "이미지 파일을 보내주세요.");
  }
  let file: File | string | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError(400, "이미지 파일을 읽지 못했습니다.");
  }
  if (!(file instanceof File)) return jsonError(400, "이미지 파일을 보내주세요.");
  if (!IMAGE_TYPES.has(file.type)) return jsonError(400, "PNG, JPEG, GIF, WEBP 이미지만 첨부할 수 있어요.");
  if (file.size > IMAGE_MAX_BYTES) return jsonError(400, "이미지는 5MB 이하만 첨부할 수 있어요.");

  try {
    return json({ id: await uploadImage(file, env) }, 201);
  } catch (error) {
    logError("이미지 업로드 실패", error);
    return jsonError(502, notionErrorMessage(error));
  }
}
