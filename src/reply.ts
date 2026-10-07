// Teams Outgoing Webhook 응답 생성기.

/** Markdown 링크 텍스트에서 링크 문법을 깨뜨리는 문자를 이스케이프한다. */
function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, "\\$&");
}

export function messageReply(text: string): Response {
  return Response.json({ type: "message", text });
}

export function successReply(title: string, pageUrl: string): Response {
  return messageReply(`✅ 등록됨: [${escapeLinkText(title)}](${pageUrl})`);
}

export function pendingReply(): Response {
  return messageReply("⏳ 접수 중입니다. 잠시 후 Notion에서 확인해주세요.");
}

export function errorReply(): Response {
  return messageReply("⚠️ 등록에 실패했어요. 잠시 후 다시 시도해주세요.");
}

export function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

export function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
