// 붙여넣기 입력 화면. 외부 리소스 없이 인라인 CSS/JS만 사용하고, CSP nonce로 인라인 실행을 허용한다.
// 사용자 입력은 항상 textContent/value로만 다룬다 (innerHTML 금지).

import { ISSUE_TYPES } from "./types";

const TEMPLATE = [
  "[버그] 한 줄 요약 (첫 줄이 제목)",
  "작성자: 홍길동",
  "링크: https://teams.microsoft.com/l/message/...",
  "",
  "내용을 붙여넣으세요.",
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
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function renderPage(nonce: string): string {
  const typeOptions = ISSUE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>이슈 등록</title>
<style nonce="${nonce}">
  :root {
    --bg: #f6f7f9; --card: #ffffff; --text: #1d2129; --muted: #6b7280; --border: #d9dde3;
    --accent: #2563eb; --accent-text: #ffffff; --danger: #c62828; --ok: #1b7f3b; --field: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #15171b; --card: #1e2126; --text: #e7e9ec; --muted: #9aa1ab; --border: #343841;
      --accent: #5b8cff; --accent-text: #0b0d10; --danger: #ff6b6b; --ok: #4cc777; --field: #16181c;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  section { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  label { display: block; font-weight: 600; margin: 12px 0 4px; }
  label:first-of-type { margin-top: 0; }
  label.check { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; font-weight: 400; }
  label.check input { width: auto; }
  input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--field); color: var(--text); font: inherit; }
  textarea { resize: vertical; min-height: 120px; }
  #paste { min-height: 220px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
  .grid { display: grid; grid-template-columns: 1fr 140px; gap: 0 12px; }
  @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
  button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--card);
    color: var(--text); font: inherit; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  button:disabled { opacity: .55; cursor: default; }
  .hint { color: var(--muted); font-size: 13px; }
  details { margin-top: 10px; }
  pre { background: var(--field); border: 1px solid var(--border); border-radius: 6px; padding: 10px; overflow-x: auto;
    white-space: pre-wrap; font-size: 13px; }
  #status { margin: 0 0 16px; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); }
  #status.error { color: var(--danger); border-color: var(--danger); }
  #status.ok { color: var(--ok); border-color: var(--ok); }
  #status a { color: inherit; font-weight: 600; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <h1>이슈 등록</h1>
  <p class="sub">Teams 대화를 붙여넣으면 Notion 이슈 트래커에 등록합니다.</p>

  <div id="status" role="status" aria-live="polite" hidden></div>

  <section>
    <label for="password">비밀번호</label>
    <input id="password" type="password" autocomplete="current-password">
    <label class="check hint"><input id="remember" type="checkbox" checked> 이 브라우저에 기억하기</label>
  </section>

  <section id="pasteSection">
    <h2>1. Teams 내용 붙여넣기</h2>
    <textarea id="paste" placeholder="Teams 메시지를 복사해 붙여넣으세요."></textarea>
    <details>
      <summary class="hint">추천 양식 보기</summary>
      <pre id="template">${escapeHtml(TEMPLATE)}</pre>
      <p class="hint">[버그]/[개선]/[운영] 태그로 유형을 정하고, 작성자:·링크: 줄은 본문에서 빠집니다.
        링크는 Teams 메시지 ••• → 링크 복사로 얻을 수 있어요.</p>
      <button type="button" id="useTemplate">양식 넣기</button>
    </details>
    <div class="row">
      <button type="button" class="primary" id="previewBtn">미리보기</button>
      <span class="hint">Ctrl+Enter</span>
    </div>
  </section>

  <section id="reviewSection" hidden>
    <h2>2. 확인 후 등록</h2>
    <div class="grid">
      <div><label for="title">제목</label><input id="title" maxlength="200"></div>
      <div><label for="type">유형</label><select id="type">${typeOptions}</select></div>
    </div>
    <label for="author">작성자</label>
    <input id="author" maxlength="100">
    <label for="sourceUrl">원문 링크</label>
    <input id="sourceUrl" type="url" placeholder="https://teams.microsoft.com/l/message/...">
    <label for="body">본문</label>
    <textarea id="body" rows="10"></textarea>
    <div class="row">
      <button type="button" class="primary" id="submitBtn">Notion에 등록</button>
      <button type="button" id="backBtn">다시 붙여넣기</button>
    </div>
  </section>

  <section id="doneSection" hidden>
    <button type="button" class="primary" id="newBtn">새 이슈 작성</button>
  </section>
</main>
<script nonce="${nonce}">
(function () {
  var KEY = "issueFormPassword";
  var $ = function (id) { return document.getElementById(id); };
  var fields = ["title", "type", "author", "sourceUrl", "body"];
  var busy = false;

  function storage(action, value) {
    try {
      if (action === "get") return localStorage.getItem(KEY) || "";
      if (action === "set") localStorage.setItem(KEY, value);
      if (action === "clear") localStorage.removeItem(KEY);
    } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }
    return "";
  }

  function showStatus(kind, text, link) {
    var box = $("status");
    box.hidden = false;
    box.className = kind;
    box.textContent = text;
    if (link && /^https:[/][/]/.test(link)) {
      box.appendChild(document.createTextNode(" "));
      var a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Notion에서 열기";
      box.appendChild(a);
    }
  }

  function hideStatus() { $("status").hidden = true; }

  function setBusy(value) {
    busy = value;
    ["previewBtn", "submitBtn", "backBtn"].forEach(function (id) { $(id).disabled = value; });
  }

  function api(path, payload) {
    var password = $("password").value;
    if (!password) return Promise.reject(new Error("비밀번호를 입력해주세요."));
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + encodeURIComponent(password) },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) storage("clear");
        if (!res.ok) throw new Error(data.error || ("요청 실패 (" + res.status + ")"));
        if ($("remember").checked) storage("set", password); else storage("clear");
        return data;
      });
    });
  }

  function preview() {
    if (busy) return;
    var text = $("paste").value;
    if (!text.trim()) { showStatus("error", "붙여넣은 내용이 없습니다."); return; }
    setBusy(true);
    api("/api/preview", { text: text }).then(function (data) {
      fields.forEach(function (name) { $(name).value = data.issue[name] || ""; });
      hideStatus();
      $("reviewSection").hidden = false;
      $("title").focus();
    }).catch(function (err) { showStatus("error", err.message); })
      .finally(function () { setBusy(false); });
  }

  function submit() {
    if (busy) return;
    var issue = {};
    fields.forEach(function (name) { issue[name] = $(name).value; });
    setBusy(true);
    api("/api/issues", issue).then(function (data) {
      showStatus("ok", "✅ 등록됨: " + issue.title.trim(), data.url);
      $("pasteSection").hidden = true;
      $("reviewSection").hidden = true;
      $("doneSection").hidden = false;
    }).catch(function (err) { showStatus("error", err.message); })
      .finally(function () { setBusy(false); });
  }

  function reset() {
    $("paste").value = "";
    fields.forEach(function (name) { if (name !== "type") $(name).value = ""; });
    $("pasteSection").hidden = false;
    $("reviewSection").hidden = true;
    $("doneSection").hidden = true;
    hideStatus();
    $("paste").focus();
  }

  $("password").value = storage("get");
  $("previewBtn").addEventListener("click", preview);
  $("submitBtn").addEventListener("click", submit);
  $("backBtn").addEventListener("click", function () { $("reviewSection").hidden = true; $("paste").focus(); });
  $("newBtn").addEventListener("click", reset);
  $("useTemplate").addEventListener("click", function () { $("paste").value = $("template").textContent; $("paste").focus(); });
  $("paste").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) preview(); });
  $("remember").addEventListener("change", function () { if (!$("remember").checked) storage("clear"); });
  ($("password").value ? $("paste") : $("password")).focus();
})();
</script>
</body>
</html>`;
}
