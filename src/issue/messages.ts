import { HEADER_MARK, isHeaderLine, normalizeText } from "./text";

// 본문 줄(Teams 머리글은 "— 이름 · 시간" 한 줄로 바뀐 상태)을 메시지 단위로 나눈다.
// 이미 처리(등록)한 메시지를 다음 붙여넣기에서 걸러낼 때 쓴다.

export interface Message {
  /** 머리글 줄. 전달된 메시지는 여러 줄, 머리글 없이 붙여넣은 글이면 빈 배열 */
  headers: string[];
  /** 작성자 표시 이름 (마지막 머리글 기준). 머리글이 없으면 null */
  author: string | null;
  content: string[];
}

/** 머리글 줄의 작성자: "— 홍길동(사원) - 유젠 · 오후 1:32" → "홍길동(사원) - 유젠" */
export function headerAuthor(line: string): string {
  return line.slice(HEADER_MARK.length).split(" · ")[0]?.trim() ?? "";
}

/** 머리글마다 새 메시지로 나눈다. 내용 없이 연달아 붙은 머리글(전달된 메시지)은 한 메시지로 묶는다. */
export function splitMessages(lines: string[]): Message[] {
  const messages: Message[] = [];
  let current: Message | null = null;

  for (const line of lines) {
    if (isHeaderLine(line)) {
      if (current?.content.every((text) => text.trim() === "")) {
        current.headers.push(line);
        current.author = headerAuthor(line);
      } else {
        current = { headers: [line], author: headerAuthor(line), content: [] };
        messages.push(current);
      }
      continue;
    }
    if (!current) {
      current = { headers: [], author: null, content: [] };
      messages.push(current);
    }
    current.content.push(line);
  }
  return messages;
}

/**
 * 같은 메시지인지 판단하는 기준: 작성자 + 내용.
 * Teams 시간 표시("오후 1:25", "어제", "2026-09-30 …")는 복사한 날마다 달라서 뺀다. 내용이 없으면 null.
 */
export function messageKey(message: Message): string | null {
  const content = normalizeText(message.content.join("\n"));
  return content === "" ? null : `${message.author ?? ""}\n${content}`;
}

/** 메시지들을 다시 본문 줄로 */
export function messageLines(messages: Message[]): string[] {
  return messages.flatMap((message) => [...message.headers, ...message.content]);
}
