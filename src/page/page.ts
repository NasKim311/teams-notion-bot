import { ISSUE_TYPES, PLATFORMS } from "../types";
import client from "./client.js";
import styles from "./styles.css";

// 붙여넣기 입력 화면 HTML. 스타일(styles.css)과 브라우저 코드(client.js)는 Wrangler가 텍스트로 읽어 오고,
// 여기서 nonce가 붙은 <style>/<script>로 인라인한다 (외부 리소스 없음, CSP).

/** 테마 선택을 저장하는 localStorage 키 (client.js의 THEME_KEY와 같아야 함, 테스트로 확인) */
export const THEME_KEY = "issueFormTheme";

/** 추천 양식: 작성자 줄 + 팀 공지 <이슈 공유 양식>. 예시 문구는 등록할 때 빠진다 (issue/form.ts). */
export const TEMPLATE = [
  "작성자: 홍길동",
  "🐞 현상 : 어떤 화면에서 어떤 문제가 생기는지 (재현 방법 포함)",
  "🌐 테스트 URL : 문제가 생기는 화면 주소",
  "🔍 원인 :",
  "🛠 처리·해결 :",
  "🎯 기대 동작 : 원래 어떻게 동작해야 하는지",
  "📂 관련 파일 : 컴포넌트 경로:줄 번호 (예: src/views/fit/FitPage.tsx:75)",
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
<script nonce="${nonce}">
/* 고른 테마를 그리기 전에 적용해 반대 색이 잠깐 보이지 않게 한다 (client.js는 body 끝에서 실행됨) */
try { const t = localStorage.getItem("${THEME_KEY}"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (_e) {}
</script>
<style nonce="${nonce}">
${styles}
</style>
</head>
<body>
<header class="topbar">
  <h1>📝 이슈 등록 <small>Teams → Notion 이슈 트래커</small></h1>
  <div class="topbar-right">
  <div class="theme" role="group" aria-label="화면 테마">
    <button type="button" data-theme-choice="system" aria-pressed="true">🖥 시스템</button>
    <button type="button" data-theme-choice="light" aria-pressed="false">☀ 라이트</button>
    <button type="button" data-theme-choice="dark" aria-pressed="false">🌙 다크</button>
  </div>
  <div class="auth">
    <div class="chip" id="authSaved" hidden><i></i>비밀번호 저장됨 · <button type="button" class="link" id="changePassword">변경</button></div>
    <div class="auth-form" id="authForm">
      <input id="password" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호">
      <label class="check"><input id="remember" type="checkbox" checked> 기억하기</label>
    </div>
  </div>
  </div>
</header>

<main class="layout">
  <section class="panel left" id="pasteSection">
    <div class="panel-head">
      <h2><span class="num">1</span>Teams 내용 붙여넣기</h2>
      <button type="button" class="link" id="useTemplate">양식 넣기</button>
    </div>
    <textarea id="paste" aria-label="붙여넣을 Teams 내용" placeholder="Teams 메시지를 복사해 붙여넣으세요. 이슈와 관련된 메시지만 골라서 붙이면 좋아요."></textarea>
    <details>
      <summary>추천 양식과 인식 규칙</summary>
      <pre id="template">${escapeHtml(TEMPLATE)}</pre>
      <p class="hint">팀 공지 양식과 같아요. 예시 문구는 지우지 않아도 등록할 때 빠져요. 제목은 현상의 첫 문장으로 자동으로 만들어져요. 직접 정하려면 맨 위에 "제목: [버그] 한 줄 요약"을 적으세요.
        "이슈 1)", "이슈 2)"처럼 여러 이슈를 한 번에 붙이면 나눠서 등록할 수 있어요. 작성자: 줄은 본문에서 빠지고, Teams 메시지 링크는 저장하지 않아요.</p>
    </details>
    <div class="drop">
      <div class="thumbs" id="pendingThumbs"></div>
      <span>Ctrl+V로 스크린샷 붙여넣기 · 또는 <label class="file-pick">파일 선택<input type="file" id="pendingFile" accept="image/png,image/jpeg,image/gif,image/webp" multiple aria-label="스크린샷 파일 선택"></label></span>
      <span class="hint">PNG/JPEG/GIF/WEBP, 5MB 이하 · 미리보기 후 첫 번째 이슈에 붙어요</span>
    </div>
    <label class="check opt"><input id="excludeProcessed" type="checkbox" checked> 이전에 처리한 메시지 제외</label>
    <button type="button" class="primary wide" id="previewBtn">미리보기 <small>Ctrl+Enter</small></button>
  </section>

  <section class="right">
    <div class="panel-head">
      <h2><span class="num">2</span>확인 후 등록 <span class="count" id="cardCount"></span></h2>
      <label class="check opt" id="splitToggle" hidden><input id="split" type="checkbox" checked> <span id="splitLabel">이슈별로 나눠 등록</span></label>
    </div>
    <div id="status" role="status" aria-live="polite" hidden></div>
    <div class="empty" id="emptyState">Teams 내용을 붙여넣고 미리보기를 누르면 여기에 이슈 카드가 나와요.</div>
    <div id="reviewSection" hidden>
      <div id="cards"></div>
      <p class="hint">새 이슈로 등록하면 본문이 현상 → 테스트 URL → 원인 → 처리·해결 → 기대 동작 → 참고 순서로 정리돼요 (작성자·시간과 답글 대화는 빠져요). 기존 이슈에 추가할 때는 그대로 붙어요.</p>
    </div>
  </section>
</main>

<footer class="bar" id="actionBar" hidden>
  <button type="button" class="secondary" id="backBtn">다시 붙여넣기</button>
  <button type="button" class="primary" id="newBtn" hidden>새 이슈 작성</button>
  <button type="button" class="primary" id="submitBtn">Notion에 등록</button>
</footer>

<template id="cardTemplate">
  <div class="card">
    <div class="card-head">
      <strong data-role="index"></strong>
      <span class="card-tools">
        <label class="check hint" data-role="skipWrap"><input type="checkbox" data-role="skip"> 등록 안 함</label>
        <span class="badge" data-role="typeBadge"></span>
      </span>
    </div>
    <div class="card-body">
      <div class="match" data-role="match" hidden>
        <span>🔎 같은 레드마인 일감으로 등록된 이슈가 있어요</span>
        <select data-role="target" aria-label="등록 방식"></select>
        <span class="status-pick" data-role="statusWrap">상태 <select data-role="status" aria-label="상태 변경"></select></span>
        <a data-role="matchLink" target="_blank" rel="noopener noreferrer">열기 ↗</a>
        <span class="kept" data-role="keptHint" hidden>기존 이슈에 추가하면 제목·유형·작성자는 기존 값이 유지되고, 본문은 업데이트로 붙어요.</span>
      </div>
      <div class="fields">
        <label>제목<input data-field="title" maxlength="200"></label>
        <div class="grid g4">
          <label>유형<select data-field="type">${typeOptions}</select></label>
          <label>FO/BO<select data-field="platform">${platformOptions}</select></label>
          <label>작성자<input data-field="author" maxlength="100"></label>
          <label>영역<input data-field="areas" placeholder="쉼표로 구분 (예: fit, evt)"></label>
        </div>
        <div class="grid g2">
          <label>레드마인 링크<input data-field="workItemUrl" type="url" placeholder="Redmine 일감 링크"></label>
          <label>MR 링크<input data-field="mrUrl" type="url" placeholder="GitLab MR 링크"></label>
        </div>
        <div class="grid g2">
          <label>브랜치 명<input data-field="branch" maxlength="2000"></label>
          <label>관련 파일<input data-field="files" maxlength="2000" placeholder="쉼표로 구분 (예: src/views/fit/pages/FitDetail.tsx:75)"></label>
        </div>
        <label>본문<textarea data-field="body" rows="8"></textarea></label>
        <div class="images">
          <div class="thumbs" data-role="thumbs"></div>
          <span class="hint">스크린샷: 이 카드를 클릭한 뒤 Ctrl+V, 또는 <label class="file-pick">파일 선택<input type="file" data-role="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple aria-label="스크린샷 파일 선택"></label></span>
        </div>
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
