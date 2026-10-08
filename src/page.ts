// 붙여넣기 입력 화면. 외부 리소스 없이 인라인 CSS/JS만 사용하고, CSP nonce로 인라인 실행을 허용한다.
// 사용자 입력은 항상 textContent/value로만 다룬다 (innerHTML 금지).

import { ISSUE_TYPES, PLATFORMS } from "./types";

const TEMPLATE = [
  "[버그] 한 줄 요약 (첫 줄이 제목)",
  "작성자: 홍길동",
  "",
  "이슈 사항 : src/views/.../Page.tsx 75번째 줄",
  "무엇이 문제인지",
  "",
  "기대 동작 : 어떻게 동작해야 하는지",
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

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

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
  :root {
    --bg: #f6f7f9; --card: #ffffff; --text: #1d2129; --muted: #6b7280; --border: #d9dde3;
    --accent: #2563eb; --accent-text: #ffffff; --danger: #c62828; --ok: #1b7f3b; --field: #ffffff; --soft: #eef2f7;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #15171b; --card: #1e2126; --text: #e7e9ec; --muted: #9aa1ab; --border: #343841;
      --accent: #5b8cff; --accent-text: #0b0d10; --danger: #ff6b6b; --ok: #4cc777; --field: #16181c; --soft: #262a31;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  section, .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  label { display: block; font-weight: 600; margin: 12px 0 0; }
  label > input, label > select, label > textarea { margin-top: 4px; font-weight: 400; }
  input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--field); color: var(--text); font: inherit; }
  textarea { resize: vertical; min-height: 120px; }
  #paste { min-height: 220px; }
  label.check { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  label.check input { width: auto; margin: 0; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
  .grid { display: grid; grid-template-columns: 1fr 140px; gap: 0 12px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
  @media (max-width: 560px) { .grid, .grid2 { grid-template-columns: 1fr; } }
  button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--card);
    color: var(--text); font: inherit; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  button:disabled { opacity: .55; cursor: default; }
  .hint { color: var(--muted); font-size: 13px; }
  details { margin-top: 10px; }
  pre { background: var(--field); border: 1px solid var(--border); border-radius: 6px; padding: 10px; overflow-x: auto;
    white-space: pre-wrap; font-size: 13px; }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .card-head strong { font-size: 15px; }
  .card.skipped .fields { opacity: .4; }
  .card.done { border-color: var(--ok); }
  .images { margin-top: 12px; }
  .images input[type=file] { margin-top: 8px; padding: 6px; }
  .thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .thumbs:empty { display: none; }
  .thumb { position: relative; }
  .thumb img { display: block; width: 112px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); }
  .thumb button { position: absolute; top: 4px; right: 4px; padding: 0 7px; line-height: 20px; font-size: 12px; }
  .match { background: var(--soft); border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
  .match a { color: var(--accent); }
  .result { margin-top: 10px; font-weight: 600; }
  .result.ok { color: var(--ok); }
  .result.error { color: var(--danger); }
  .result a { color: inherit; }
  #status { margin: 0 0 16px; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); }
  #status.error { color: var(--danger); border-color: var(--danger); }
  #status.ok { color: var(--ok); border-color: var(--ok); }
  [hidden] { display: none !important; }
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
      <p class="hint">이슈 사항/기대 동작/이슈 원인 같은 라벨이나 [ 이슈 ] 같은 대괄호 라벨은 Notion에서 소제목이 됩니다.
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
      <div class="hint">새 이슈로 등록하면 본문이 현상 → 기대 동작 → 원인 → 처리·해결 → 참고 순서로 정리돼요 (작성자·시간과 답글 대화는 빠져요). 기존 이슈에 추가할 때는 그대로 붙어요.</div>
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
(function () {
  var KEY = "issueFormPassword";
  var $ = function (id) { return document.getElementById(id); };
  var fields = ["title", "type", "author", "platform", "workItemUrl", "mrUrl", "branch", "files", "areas", "body"];
  var cards = [];
  var busy = false;

  function storage(action, value) {
    try {
      if (action === "get") return localStorage.getItem(KEY) || "";
      if (action === "set") localStorage.setItem(KEY, value);
      if (action === "clear") localStorage.removeItem(KEY);
    } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }
    return "";
  }

  function showStatus(kind, text) {
    var box = $("status");
    box.hidden = false;
    box.className = kind;
    box.textContent = text;
  }

  function hideStatus() { $("status").hidden = true; }

  function setLink(el, prefix, url) {
    el.textContent = prefix + " ";
    if (url && /^https:[/][/]/.test(url)) {
      var a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Notion에서 열기";
      el.appendChild(a);
    }
  }

  function setBusy(value) {
    busy = value;
    ["previewBtn", "submitBtn", "backBtn", "split"].forEach(function (id) { $(id).disabled = value; });
  }

  function api(path, payload, isForm) {
    var password = $("password").value;
    if (!password) return Promise.reject(new Error("비밀번호를 입력해주세요."));
    var headers = { "Authorization": "Bearer " + encodeURIComponent(password) };
    if (!isForm) headers["Content-Type"] = "application/json";
    return fetch(path, {
      method: "POST",
      headers: headers,
      body: isForm ? payload : JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) storage("clear");
        if (!res.ok) throw new Error(data.error || ("요청 실패 (" + res.status + ")"));
        if ($("remember").checked) storage("set", password); else storage("clear");
        return data;
      });
    });
  }

  function fieldValue(issue, name) {
    var value = issue[name];
    if (Array.isArray(value)) return value.join(", ");
    return value || "";
  }

  function field(card, name) { return card.root.querySelector('[data-field="' + name + '"]'); }

  // ── 스크린샷 ─────────────────────────────────────────────
  var IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  var IMAGE_MAX = 5 * 1024 * 1024;
  var pendingImages = []; // 미리보기 전에 붙인 이미지 → 첫 번째 카드로
  var activeCard = null;

  function makeImage(file) {
    if (IMAGE_TYPES.indexOf(file.type) === -1) { showStatus("error", "PNG, JPEG, GIF, WEBP 이미지만 첨부할 수 있어요."); return null; }
    if (file.size > IMAGE_MAX) { showStatus("error", "이미지는 5MB 이하만 첨부할 수 있어요."); return null; }
    return { file: file, url: URL.createObjectURL(file), id: null };
  }

  function renderThumbs(container, list) {
    container.textContent = "";
    list.forEach(function (img, i) {
      var wrap = document.createElement("div");
      wrap.className = "thumb";
      var el = document.createElement("img");
      el.src = img.url;
      el.alt = "스크린샷 " + (i + 1);
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "✕";
      del.setAttribute("aria-label", "스크린샷 " + (i + 1) + " 삭제");
      del.addEventListener("click", function () {
        URL.revokeObjectURL(img.url);
        list.splice(i, 1);
        renderThumbs(container, list);
      });
      wrap.appendChild(el);
      wrap.appendChild(del);
      container.appendChild(wrap);
    });
  }

  function addFiles(files, target) {
    Array.prototype.forEach.call(files, function (file) {
      var img = makeImage(file);
      if (img) target.list.push(img);
    });
    renderThumbs(target.container, target.list);
  }

  function cardTarget(card) { return { list: card.images, container: card.root.querySelector('[data-role="thumbs"]') }; }

  function imageTarget() {
    if (!$("reviewSection").hidden) {
      var open = cards.filter(function (c) { return !c.done; });
      var card = activeCard && open.indexOf(activeCard) !== -1 ? activeCard : open[0];
      if (card) return cardTarget(card);
    }
    return { list: pendingImages, container: $("pendingThumbs") };
  }

  function uploadImages(card) {
    return card.images.reduce(function (chain, img) {
      return chain.then(function () {
        if (img.id) return;
        var form = new FormData();
        form.append("file", img.file, img.file.name || "screenshot.png");
        return api("/api/uploads", form, true).then(function (data) { img.id = data.id; });
      });
    }, Promise.resolve()).then(function () {
      return card.images.map(function (img) { return img.id; });
    });
  }

  function option(value, text) {
    var el = document.createElement("option");
    el.value = value;
    el.textContent = text;
    return el;
  }

  function setupMatch(card, lookup, statusOptions) {
    var matches = (lookup && lookup.matches) || [];
    if (matches.length === 0) return;
    var root = card.root;
    var target = root.querySelector('[data-role="target"]');
    var status = root.querySelector('[data-role="status"]');
    var link = root.querySelector('[data-role="matchLink"]');

    matches.forEach(function (m) {
      target.appendChild(option(m.id, "기존 이슈에 추가: " + m.title + (m.status ? " (" + m.status + ")" : "")));
    });
    target.appendChild(option("", "새 이슈로 등록"));
    status.appendChild(option("", "변경 안 함"));
    statusOptions.forEach(function (name) { status.appendChild(option(name, name)); });
    if (lookup.suggestedStatus) status.value = lookup.suggestedStatus;

    function sync() {
      var m = matches.filter(function (x) { return x.id === target.value; })[0];
      link.hidden = !m;
      if (m && /^https:[/][/]/.test(m.url)) link.href = m.url;
      root.querySelector('[data-role="statusWrap"]').hidden = !m;
    }
    target.addEventListener("change", sync);
    sync();
    root.querySelector('[data-role="match"]').hidden = false;
    card.target = target;
    card.status = status;
  }

  function renderCards(data) {
    var issues = data.issues;
    var list = $("cards");
    // 다시 미리보기할 때 카드에 붙어 있던 이미지는 유지한다
    cards.forEach(function (card) { pendingImages = pendingImages.concat(card.images); });
    renderThumbs($("pendingThumbs"), []);
    list.textContent = "";
    cards = issues.map(function (issue, i) {
      var root = $("cardTemplate").content.firstElementChild.cloneNode(true);
      var card = { root: root, done: false, target: null, status: null, images: i === 0 ? pendingImages.splice(0) : [] };
      setupMatch(card, (data.lookups || [])[i], data.statusOptions || []);
      renderThumbs(cardTarget(card).container, card.images);
      root.querySelector('[data-role="file"]').addEventListener("change", function (e) {
        addFiles(e.target.files, cardTarget(card));
        e.target.value = "";
      });
      root.addEventListener("focusin", function () { activeCard = card; });
      root.addEventListener("click", function () { activeCard = card; });
      root.querySelector('[data-role="index"]').textContent = issues.length > 1 ? "이슈 " + (i + 1) + " / " + issues.length : "";
      root.querySelector('[data-role="skipWrap"]').hidden = issues.length < 2;
      root.querySelector('[data-role="skip"]').addEventListener("change", function (e) {
        root.classList.toggle("skipped", e.target.checked);
      });
      fields.forEach(function (name) { field(card, name).value = fieldValue(issue, name); });
      list.appendChild(root);
      return card;
    });
  }

  function preview() {
    if (busy) return;
    var text = $("paste").value;
    if (!text.trim()) { showStatus("error", "붙여넣은 내용이 없습니다."); return; }
    setBusy(true);
    api("/api/preview", { text: text, split: $("split").checked }).then(function (data) {
      renderCards(data);
      $("splitToggle").hidden = !data.splittable;
      if (data.lookupError) showStatus("", data.lookupError); else hideStatus();
      $("reviewSection").hidden = false;
      field(cards[0], "title").focus();
    }).catch(function (err) { showStatus("error", err.message); })
      .finally(function () { setBusy(false); });
  }

  function collect(card) {
    var issue = {};
    fields.forEach(function (name) { issue[name] = field(card, name).value; });
    return issue;
  }

  function markDone(card, url, label) {
    card.done = label;
    card.root.classList.add("done");
    card.root.querySelectorAll("input, select, textarea, button").forEach(function (el) { el.disabled = true; });
    var result = card.root.querySelector('[data-role="result"]');
    result.hidden = false;
    result.className = "result ok";
    setLink(result, label === "update" ? "✅ 기존 이슈에 추가됨" : "✅ 등록됨", url);
  }

  function send(card) {
    var issue = collect(card);
    var pageId = card.target ? card.target.value : "";
    return uploadImages(card).then(function (imageIds) {
      if (pageId) {
        return api("/api/issues/update", { pageId: pageId, issue: issue, status: card.status.value || null, imageIds: imageIds })
          .then(function (data) { markDone(card, data.url, "update"); });
      }
      issue.imageIds = imageIds;
      return api("/api/issues", issue).then(function (data) { markDone(card, data.url, "create"); });
    });
  }

  function markError(card, message) {
    var result = card.root.querySelector('[data-role="result"]');
    result.hidden = false;
    result.className = "result error";
    result.textContent = message;
  }

  function submit() {
    if (busy) return;
    var pending = cards.filter(function (card) {
      return !card.done && !card.root.querySelector('[data-role="skip"]').checked;
    });
    if (pending.length === 0) { showStatus("error", "등록할 이슈가 없습니다."); return; }
    setBusy(true);
    hideStatus();

    pending.reduce(function (chain, card) {
      return chain.then(function () {
        return send(card).catch(function (err) { markError(card, err.message); throw err; });
      });
    }, Promise.resolve()).then(function () {
      var created = cards.filter(function (card) { return card.done === "create"; }).length;
      var updated = cards.filter(function (card) { return card.done === "update"; }).length;
      showStatus("ok", "✅ 새 이슈 " + created + "건" + (updated ? ", 기존 이슈 업데이트 " + updated + "건" : ""));
      $("pasteSection").hidden = true;
      $("submitBtn").hidden = true;
      $("doneSection").hidden = false;
    }).catch(function (err) { showStatus("error", "등록 중 오류: " + err.message + " (완료된 이슈는 다시 등록되지 않아요)"); })
      .finally(function () { setBusy(false); });
  }

  function reset() {
    cards.forEach(function (card) { card.images.forEach(function (img) { URL.revokeObjectURL(img.url); }); });
    pendingImages.forEach(function (img) { URL.revokeObjectURL(img.url); });
    pendingImages = [];
    renderThumbs($("pendingThumbs"), pendingImages);
    activeCard = null;
    $("paste").value = "";
    $("cards").textContent = "";
    cards = [];
    $("split").checked = true;
    $("pasteSection").hidden = false;
    $("reviewSection").hidden = true;
    $("submitBtn").hidden = false;
    $("doneSection").hidden = true;
    hideStatus();
    $("paste").focus();
  }

  $("password").value = storage("get");
  $("previewBtn").addEventListener("click", preview);
  $("submitBtn").addEventListener("click", submit);
  $("backBtn").addEventListener("click", function () { $("reviewSection").hidden = true; $("paste").focus(); });
  $("newBtn").addEventListener("click", reset);
  $("split").addEventListener("change", preview);
  $("useTemplate").addEventListener("click", function () { $("paste").value = $("template").textContent; $("paste").focus(); });
  $("paste").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) preview(); });
  $("remember").addEventListener("change", function () { if (!$("remember").checked) storage("clear"); });
  $("pendingFile").addEventListener("change", function (e) {
    addFiles(e.target.files, { list: pendingImages, container: $("pendingThumbs") });
    e.target.value = "";
  });
  document.addEventListener("paste", function (e) {
    var data = e.clipboardData;
    if (!data || !data.files) return;
    var images = Array.prototype.filter.call(data.files, function (f) { return f.type.indexOf("image/") === 0; });
    if (images.length === 0) return;
    // 글자 없이 이미지만 붙여넣을 때는 입력칸에 이상한 값이 들어가지 않게 막는다
    if (!data.getData("text/plain")) e.preventDefault();
    addFiles(images, imageTarget());
  });
  ($("password").value ? $("paste") : $("password")).focus();
})();
</script>
</body>
</html>`;
}
