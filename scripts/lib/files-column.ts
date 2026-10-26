// 예전 "관련 파일" 컬럼 값 → 본문의 관련 파일 섹션 (2026-10-26부터 컬럼에 쓰지 않음). restructure 스크립트가 쓴다.
import { SECTION_TITLES, structureBody } from "../../src/issue/structure";

/** 봇이 더 이상 쓰지 않는 컬럼이라 PROP에 없다. */
export const FILES_COLUMN = "관련 파일";

/** 고정 틀로 정리된 본문에서 관련 파일 섹션의 글 */
function filesSection(structured: string): string {
  const start = structured.indexOf(`[ ${SECTION_TITLES.files} ]`);
  const end = structured.indexOf(`[ ${SECTION_TITLES.note} ]`);
  return start === -1 || end < start ? "" : structured.slice(start, end);
}

/** 본문을 고정 틀로 정리하고, 컬럼("a.tsx:1, b.tsx")의 파일 중 관련 파일 섹션에 없는 것을 한 줄씩 넣는다. */
export function structureWithFilesColumn(text: string, column: string): string {
  const structured = structureBody(text);
  const section = filesSection(structured);
  const files = column
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean);
  // 예전 추출이 "src/…/FitList.tsx"와 "FitList.tsx"를 따로 넣은 경우가 있다
  const hasFullPath = (file: string) => files.some((other) => other.endsWith(`/${file}`));
  const missing = files.filter((file) => !hasFullPath(file) && !section.includes(file));
  if (missing.length === 0) return structured;
  return structureBody(`${text}\n\n${SECTION_TITLES.files} :\n${missing.join("\n")}`);
}
