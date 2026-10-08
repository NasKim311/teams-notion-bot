import { NotionError } from "../notion/client";

// 오류 로그. Notion 오류는 status/code만 남기고, 붙여넣은 내용·토큰은 남기지 않는다.

export function logError(context: string, error: unknown): void {
  if (error instanceof NotionError) {
    console.error(`${context}: Notion status=${error.status} code=${error.code}`);
  } else {
    console.error(`${context}:`, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
}
