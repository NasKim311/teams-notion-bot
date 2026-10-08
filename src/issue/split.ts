import { labelKey, matchSectionLabel, PRIMARY_LABELS } from "./sections";

// 한 메시지에 담긴 여러 이슈를 나눈다.

const isPrimarySection = (line: string) => {
  const section = matchSectionLabel(line);
  return section !== null && section.number === undefined && PRIMARY_LABELS.has(labelKey(section.label));
};

/**
 * 한 메시지에 이슈가 여러 개면 나눈다. 나눌 수 없으면 null.
 *  - "이슈 1)", "이슈 2)" 번호 라벨: 같은 번호끼리 모은다 (나중에 달린 답글의 "이슈 1)"도 1번에 합쳐짐)
 *  - 그 외 "[ 이슈 ]"/"이슈 사항 :" 같은 주 섹션이 2번 이상: 등장할 때마다 나눈다
 * 첫 라벨 앞의 내용(머리글, 브랜치 등)은 공통 맥락으로 각 이슈 앞에 붙인다.
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
  if (starts.length < 2) return null;
  const head = lines.slice(0, starts[0]);
  return starts.map((start, i) => [...head, ...lines.slice(start, starts[i + 1] ?? lines.length)]);
}
