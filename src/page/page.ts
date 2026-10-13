import { ISSUE_TYPES, PLATFORMS } from "../types";
import client from "./client.js";
import styles from "./styles.css";

// 붙여넣기 입력 화면 HTML. 스타일(styles.css)과 브라우저 코드(client.js)는 Wrangler가 텍스트로 읽어 오고,
// 여기서 nonce가 붙은 <style>/<script>로 인라인한다 (외부 리소스 없음, CSP).

const TEMPLATE = [
  "작성자: 홍길동",
  "🐞 현상 : 어떤 화면에서 어떤 문제가 생기는지 (재현 방법 포함)",
  "🌐 테스트 URL : 문제가 생기는 화면 주소",
  "🔍 원인 : ",
  "🛠 처리·해결 : ",
  "🎯 기대 동작 : 원래 어떻게 동작해야 하는지",
  "📂 관련 파일 : src/views/fit/FitPage.tsx:75",
  "📎 참고 : 이미지 등 참고할 만한 자료",
].join("\n");

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

export function renderPage(nonce: string): string {
  const typeOptions = ISSUE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("");
  const platformOptions = ["", ...PLATFORMS].map((p) => `<option value="${p}">${p || "-"}</option>`).join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>이슈 등록</title>
<style nonce="${nonce}">
${styles}
</style>
</head>
<body>
<main>
  <h1>이슈 등록</h1>
  <p class="sub">Teams 대화를 붙여넣으면 Notion 이슈 트래커에 등록합니다.</p>

  <div id="status" role="status" aria-live="polite" hidden></div>

  <section>
    <label>비밀번호<input id="password" type="password" autocomplete="current-password"></label>
    <label class="check hint"><input id="remember" type="checkbox" checked> 이 브라우저에 기억하기</label>
  </section>

  <section id="pasteSection">
    <h2>1. Teams 내용 붙여넣기</h2>
    <textarea id="paste" aria-label="붙여넣을 Teams 내용" placeholder="Teams 메시지를 복사해 붙여넣으세요. 이슈와 관련된 메시지만 골라서 붙이면 좋아요."></textarea>
    <details>
      <summary class="hint">추천 양식 보기</summary>
      <pre id="template">${escapeHtml(TEMPLATE)}</pre>
      <p class="hint">팀 공지 양식과 같아요. 제목은 현상의 첫 문장으로 자동으로 만들어져요. 직접 정하려면 맨 위에 "제목: [버그] 한 줄 요약"을 적으세요.
        이슈 사항/이슈 원인/해결 방법/기대 동작 같은 라벨은 Notion에서 현상/원인/처리·해결/기대 동작 섹션으로 정리돼요.
        "이슈 1)", "이슈 2)"처럼 여러 이슈를 한 번에 붙이면 나눠서 등록할 수 있어요.
        작성자: 줄은 본문에서 빠지고, Teams 메시지 링크는 저장하지 않아요.</p>
      <button type="button" id="useTemplate">양식 넣기</button>
    </details>
    <div class="images">
      <div class="hint">스크린샷: 이 화면에서 Ctrl+V로 이미지를 붙여넣거나 파일을 선택하세요 (PNG/JPEG/GIF/WEBP, 5MB 이하). 미리보기 후 첫 번째 이슈에 붙어요.</div>
      <div class="thumbs" id="pendingThumbs"></div>
      <input type="file" id="pendingFile" accept="image/png,image/jpeg,image/gif,image/webp" multiple aria-label="스크린샷 파일 선택">
    </div>
    <div class="row">
      <button type="button" class="primary" id="previewBtn">미리보기</button>
      <span class="hint">Ctrl+Enter</span>
      <label class="check hint"><input id="excludeProcessed" type="checkbox" checked> 이전에 처리한 메시지 제외</label>
    </div>
  </section>

  <section id="reviewSection" hidden>
    <h2>2. 확인 후 등록</h2>
    <label class="check" id="splitToggle" hidden><input id="split" type="checkbox" checked> <span id="splitLabel">이슈별로 나눠 등록</span></label>
    <div id="cards"></div>
    <div class="row">
      <button type="button" class="primary" id="submitBtn">Notion에 등록</button>
      <button type="button" id="backBtn">다시 붙여넣기</button>
    </div>
  </section>

  <section id="doneSection" hidden>
    <button type="button" class="primary" id="newBtn">새 이슈 작성</button>
  </section>
</main>

<template id="cardTemplate">
  <div class="card">
    <div class="card-head">
      <strong data-role="index"></strong>
      <label class="check hint" data-role="skipWrap"><input type="checkbox" data-role="skip"> 이 이슈는 등록 안 함</label>
    </div>
    <div class="match" data-role="match" hidden>
      <div>🔎 같은 레드마인 일감으로 등록된 이슈가 있어요. <a data-role="matchLink" target="_blank" rel="noopener noreferrer">열기</a></div>
      <div class="grid2">
        <label>등록 방식<select data-role="target"></select></label>
        <label data-role="statusWrap">상태 변경<select data-role="status"></select></label>
      </div>
    </div>
    <div class="fields">
      <div class="grid">
        <label>제목<input data-field="title" maxlength="200"></label>
        <label>유형<select data-field="type">${typeOptions}</select></label>
      </div>
      <div class="grid2">
        <label>작성자<input data-field="author" maxlength="100"></label>
        <label>FO/BO<select data-field="platform">${platformOptions}</select></label>
        <label>레드마인 링크<input data-field="workItemUrl" type="url" placeholder="Redmine 일감 링크"></label>
        <label>MR 링크<input data-field="mrUrl" type="url" placeholder="GitLab MR 링크"></label>
        <label>브랜치 명<input data-field="branch" maxlength="2000"></label>
        <label>영역<input data-field="areas" placeholder="쉼표로 구분 (예: fit, evt)"></label>
      </div>
      <label>관련 파일<input data-field="files" maxlength="2000" placeholder="쉼표로 구분 (예: src/views/fit/pages/FitDetail.tsx:75)"></label>
      <label>본문<textarea data-field="body" rows="10"></textarea></label>
      <div class="hint">새 이슈로 등록하면 본문이 현상 → 테스트 URL → 원인 → 처리·해결 → 기대 동작 → 참고 순서로 정리돼요 (작성자·시간과 답글 대화는 빠져요). 기존 이슈에 추가할 때는 그대로 붙어요.</div>
      <div class="images">
        <div class="hint">스크린샷 (이 카드를 클릭한 뒤 Ctrl+V, 또는 파일 선택)</div>
        <div class="thumbs" data-role="thumbs"></div>
        <input type="file" data-role="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple aria-label="스크린샷 파일 선택">
      </div>
    </div>
    <div class="result" data-role="result" hidden></div>
  </div>
</template>

<script nonce="${nonce}">
${client}
</script>
</body>
</html>`;
}
