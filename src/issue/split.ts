import { labelKey, matchSectionLabel, PRIMARY_LABELS } from "./sections";
import { isHeaderLine } from "./text";

// 한 메시지에 담긴 여러 이슈를 나눈다.

const isPrimarySection = (line: string) => {
  const section = matchSectionLabel(line);
  return section !== null && section.number === undefined && PRIMARY_LABELS.has(labelKey(section.label));
};

/**
 * 이슈 시작 줄 바로 앞(빈 줄만 사이에 둔)에 Teams 머리글이 있으면 그 머리글의 위치, 없으면 시작 줄 그대로.
 * 다른 사람의 메시지라면 그 머리글부터가 새 이슈다 (B7). 연달아 붙은 머리글(전달된 메시지)은 함께 가져간다.
 */
function ownHeaderStart(lines: string[], start: number): number {
  let i = start - 1;
  while (i >= 0 && (lines[i] ?? "").trim() === "") i -= 1;
  if (i < 0 || !isHeaderLine(lines[i] ?? "")) return start;
  while (i > 0 && isHeaderLine(lines[i - 1] ?? "")) i -= 1;
  return i;
}

/**
 * 한 메시지에 이슈가 여러 개면 나눈다. 나눌 수 없으면 null.
 *  - "이슈 1)", "이슈 2)" 번호 라벨: 같은 번호끼리 모은다 (나중에 달린 답글의 "이슈 1)"도 1번에 합쳐짐)
 *  - 그 외 "[ 이슈 ]"/"이슈 사항 :" 같은 주 섹션이 2번 이상: 등장할 때마다 나눈다
 * 첫 라벨 앞의 내용(머리글, 브랜치 등)은 공통 맥락으로 각 이슈 앞에 붙인다.
 * 단, 주 섹션 바로 앞에 머리글이 있으면(다른 메시지) 그 머리글부터 자르고 공통 맥락을 붙이지 않는다.
 */
export function splitIssueLines(lines: string[]): string[][] | null {
  const numbered = new Map<number, string[]>();
  const preamble: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const number = matchSectionLabel(line)?.number;
    if (number !== undefined) {
      current = numbered.get(number) ?? [];
      numbered.set(number, current);
    }
    (current ?? preamble).push(line);
  }
  if (numbered.size >= 2) {
    return [...numbered.entries()].sort(([a], [b]) => a - b).map(([, chunk]) => [...preamble, ...chunk]);
  }

  const starts = lines.flatMap((line, index) => (isPrimarySection(line) ? [index] : []));
  const first = starts[0];
  if (first === undefined || starts.length < 2) return null;
  const head = lines.slice(0, first);
  const begins = starts.map((start, i) => (i === 0 ? start : ownHeaderStart(lines, start)));
  return starts.map((start, i) => {
    const begin = begins[i] ?? start;
    const body = lines.slice(begin, begins[i + 1] ?? lines.length);
    return i > 0 && begin < start ? body : [...head, ...body];
  });
}
