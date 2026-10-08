// 붙여넣은 텍스트 정규화와 본문 속 머리글 줄 표시 (여러 모듈이 함께 쓰는 기본 도구).

/** 본문에서 Teams 머리글(작성자·시간)을 대신하는 줄의 접두어 */
export const HEADER_MARK = "— ";

/** 줄바꿈 통일, 줄 끝 공백 제거, 연속 빈 줄 축소. 공백류(NBSP 등)는 일반 공백으로. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const isHeaderLine = (line: string) => line.startsWith(HEADER_MARK);
