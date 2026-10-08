// 입력 화면 브라우저 코드. page.ts가 <script nonce>로 인라인한다.
// 빌드 없이 그대로 실행되므로 TypeScript·import를 쓰지 않는다. 사용자 입력은 textContent/value로만 다룬다.
(() => {
  const KEY = "issueFormPassword";
  const $ = (id) => document.getElementById(id);
  const fields = ["title", "type", "author", "platform", "workItemUrl", "mrUrl", "branch", "files", "areas", "body"];
  let cards = [];
  let busy = false;
  let fingerprints = []; // 이번 미리보기 메시지들의 지문 (등록이 모두 끝나면 기록)

  function storage(action, value) {
    try {
      if (action === "get") return localStorage.getItem(KEY) || "";
      if (action === "set") localStorage.setItem(KEY, value);
      if (action === "clear") localStorage.removeItem(KEY);
    } catch (_e) {
      /* 저장소를 쓸 수 없는 환경 */
    }
    return "";
  }

  function showStatus(kind, text) {
    const box = $("status");
    box.hidden = false;
    box.className = kind;
    box.textContent = text;
  }

  function hideStatus() {
    $("status").hidden = true;
  }

  function setLink(el, prefix, url) {
    el.textContent = `${prefix} `;
    if (url && /^https:[/][/]/.test(url)) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Notion에서 열기";
      el.appendChild(a);
    }
  }

  function setBusy(value) {
    busy = value;
    ["previewBtn", "submitBtn", "backBtn", "split"].forEach((id) => {
      $(id).disabled = value;
    });
  }

  function api(path, payload, isForm) {
    const password = $("password").value;
    if (!password) return Promise.reject(new Error("비밀번호를 입력해주세요."));
    const headers = { Authorization: `Bearer ${encodeURIComponent(password)}` };
    if (!isForm) headers["Content-Type"] = "application/json";
    return fetch(path, {
      method: "POST",
      headers: headers,
      body: isForm ? payload : JSON.stringify(payload),
    }).then((res) =>
      res
        .json()
        .catch(() => ({}))
        .then((data) => {
          if (res.status === 401) storage("clear");
          if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
          if ($("remember").checked) storage("set", password);
          else storage("clear");
          return data;
        }),
    );
  }

  function fieldValue(issue, name) {
    const value = issue[name];
    if (Array.isArray(value)) return value.join(", ");
    return value || "";
  }

  function field(card, name) {
    return card.root.querySelector(`[data-field="${name}"]`);
  }

  // ── 스크린샷 ─────────────────────────────────────────────
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  const IMAGE_MAX = 5 * 1024 * 1024;
  let pendingImages = []; // 미리보기 전에 붙인 이미지 → 첫 번째 카드로
  let activeCard = null;

  function makeImage(file) {
    if (IMAGE_TYPES.indexOf(file.type) === -1) {
      showStatus("error", "PNG, JPEG, GIF, WEBP 이미지만 첨부할 수 있어요.");
      return null;
    }
    if (file.size > IMAGE_MAX) {
      showStatus("error", "이미지는 5MB 이하만 첨부할 수 있어요.");
      return null;
    }
    return { file: file, url: URL.createObjectURL(file), id: null };
  }

  function renderThumbs(container, list) {
    container.textContent = "";
    list.forEach((img, i) => {
      const wrap = document.createElement("div");
      wrap.className = "thumb";
      const el = document.createElement("img");
      el.src = img.url;
      el.alt = `스크린샷 ${i + 1}`;
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "✕";
      del.setAttribute("aria-label", `스크린샷 ${i + 1} 삭제`);
      del.addEventListener("click", () => {
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
    Array.prototype.forEach.call(files, (file) => {
      const img = makeImage(file);
      if (img) target.list.push(img);
    });
    renderThumbs(target.container, target.list);
  }

  function cardTarget(card) {
    return { list: card.images, container: card.root.querySelector('[data-role="thumbs"]') };
  }

  function imageTarget() {
    if (!$("reviewSection").hidden) {
      const open = cards.filter((c) => !c.done);
      const card = activeCard && open.indexOf(activeCard) !== -1 ? activeCard : open[0];
      if (card) return cardTarget(card);
    }
    return { list: pendingImages, container: $("pendingThumbs") };
  }

  function uploadImages(card) {
    return card.images
      .reduce(
        (chain, img) =>
          chain.then(() => {
            if (img.id) return;
            const form = new FormData();
            form.append("file", img.file, img.file.name || "screenshot.png");
            return api("/api/uploads", form, true).then((data) => {
              img.id = data.id;
            });
          }),
        Promise.resolve(),
      )
      .then(() => card.images.map((img) => img.id));
  }

  function option(value, text) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = text;
    return el;
  }

  function setupMatch(card, lookup, statusOptions) {
    const matches = lookup?.matches || [];
    if (matches.length === 0) return;
    const root = card.root;
    const target = root.querySelector('[data-role="target"]');
    const status = root.querySelector('[data-role="status"]');
    const link = root.querySelector('[data-role="matchLink"]');

    matches.forEach((m) => {
      target.appendChild(option(m.id, `기존 이슈에 추가: ${m.title}${m.status ? ` (${m.status})` : ""}`));
    });
    target.appendChild(option("", "새 이슈로 등록"));
    status.appendChild(option("", "변경 안 함"));
    statusOptions.forEach((name) => {
      status.appendChild(option(name, name));
    });
    if (lookup.suggestedStatus) status.value = lookup.suggestedStatus;

    function sync() {
      const m = matches.filter((x) => x.id === target.value)[0];
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
    const issues = data.issues;
    const list = $("cards");
    // 다시 미리보기할 때 카드에 붙어 있던 이미지는 유지한다
    cards.forEach((card) => {
      pendingImages = pendingImages.concat(card.images);
    });
    renderThumbs($("pendingThumbs"), []);
    list.textContent = "";
    cards = issues.map((issue, i) => {
      const root = $("cardTemplate").content.firstElementChild.cloneNode(true);
      const card = {
        root: root,
        done: false,
        target: null,
        status: null,
        images: i === 0 ? pendingImages.splice(0) : [],
      };
      setupMatch(card, (data.lookups || [])[i], data.statusOptions || []);
      renderThumbs(cardTarget(card).container, card.images);
      root.querySelector('[data-role="file"]').addEventListener("change", (e) => {
        addFiles(e.target.files, cardTarget(card));
        e.target.value = "";
      });
      root.addEventListener("focusin", () => {
        activeCard = card;
      });
      root.addEventListener("click", () => {
        activeCard = card;
      });
      root.querySelector('[data-role="index"]').textContent =
        issues.length > 1 ? `이슈 ${i + 1} / ${issues.length}` : "";
      root.querySelector('[data-role="skipWrap"]').hidden = issues.length < 2;
      root.querySelector('[data-role="skip"]').addEventListener("change", (e) => {
        root.classList.toggle("skipped", e.target.checked);
      });
      fields.forEach((name) => {
        field(card, name).value = fieldValue(issue, name);
      });
      list.appendChild(root);
      return card;
    });
  }

  // 이미 등록한 카드가 있으면 다시 미리보기하지 않는다. 카드를 새로 만들면 완료 표시가 사라져 같은 이슈가 또 등록된다 (B3)
  const hasDone = () => cards.some((card) => card.done);
  const BLOCKED_MESSAGE =
    "이미 등록한 이슈가 있어 다시 미리보기할 수 없어요. 남은 이슈를 등록하거나 '새 이슈 작성'으로 처음부터 시작하세요.";

  function preview() {
    if (busy) return;
    if (hasDone()) {
      showStatus("error", BLOCKED_MESSAGE);
      return;
    }
    const text = $("paste").value;
    if (!text.trim()) {
      showStatus("error", "붙여넣은 내용이 없습니다.");
      return;
    }
    setBusy(true);
    api("/api/preview", { text: text, split: $("split").checked, excludeProcessed: $("excludeProcessed").checked })
      .then((data) => {
        const excluded = data.excluded || 0;
        if (data.issues.length === 0) {
          showStatus(
            "error",
            excluded
              ? `새 메시지가 없어요. 이전에 처리한 메시지 ${excluded}개를 뺐어요. 다시 보려면 '이전에 처리한 메시지 제외'를 끄고 미리보기하세요.`
              : "정리할 내용이 없습니다.",
          );
          return;
        }
        fingerprints = data.fingerprints || [];
        renderCards(data);
        $("splitToggle").hidden = !data.splittable;
        const notes = [];
        if (excluded) notes.push(`이전에 처리한 메시지 ${excluded}개를 빼고 새 메시지만 정리했어요.`);
        if (data.lookupError) notes.push(data.lookupError);
        if (notes.length) showStatus("", notes.join(" "));
        else hideStatus();
        $("reviewSection").hidden = false;
        field(cards[0], "title").focus();
      })
      .catch((err) => {
        showStatus("error", err.message);
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function collect(card) {
    const issue = {};
    fields.forEach((name) => {
      issue[name] = field(card, name).value;
    });
    return issue;
  }

  function markDone(card, url, label) {
    card.done = label;
    card.root.classList.add("done");
    card.root.querySelectorAll("input, select, textarea, button").forEach((el) => {
      el.disabled = true;
    });
    const result = card.root.querySelector('[data-role="result"]');
    result.hidden = false;
    result.className = "result ok";
    setLink(result, label === "update" ? "✅ 기존 이슈에 추가됨" : "✅ 등록됨", url);
  }

  function send(card) {
    const issue = collect(card);
    const pageId = card.target ? card.target.value : "";
    return uploadImages(card).then((imageIds) => {
      if (pageId) {
        return api("/api/issues/update", {
          pageId: pageId,
          issue: issue,
          status: card.status.value || null,
          imageIds: imageIds,
        }).then((data) => {
          markDone(card, data.url, "update");
        });
      }
      issue.imageIds = imageIds;
      return api("/api/issues", issue).then((data) => {
        markDone(card, data.url, "create");
      });
    });
  }

  function markError(card, message) {
    const result = card.root.querySelector('[data-role="result"]');
    result.hidden = false;
    result.className = "result error";
    result.textContent = message;
  }

  function submit() {
    if (busy) return;
    const pending = cards.filter((card) => !card.done && !card.root.querySelector('[data-role="skip"]').checked);
    if (pending.length === 0) {
      showStatus("error", "등록할 이슈가 없습니다.");
      return;
    }
    setBusy(true);
    hideStatus();

    pending
      .reduce(
        (chain, card) =>
          chain.then(() =>
            send(card).catch((err) => {
              markError(card, err.message);
              throw err;
            }),
          ),
        Promise.resolve(),
      )
      // 모두 끝났을 때만 이번 메시지를 "처리함"으로 기록한다 (등록 안 함으로 둔 카드 포함). 일부만 됐으면 기록하지 않는다
      .then(() =>
        fingerprints.length
          ? api("/api/processed", { fingerprints: fingerprints }).then(
              () => "",
              (err) => ` (처리 기록 실패: ${err.message})`,
            )
          : "",
      )
      .then((recordNote) => {
        const created = cards.filter((card) => card.done === "create").length;
        const updated = cards.filter((card) => card.done === "update").length;
        showStatus("ok", `✅ 새 이슈 ${created}건${updated ? `, 기존 이슈 업데이트 ${updated}건` : ""}${recordNote}`);
        $("pasteSection").hidden = true;
        $("submitBtn").hidden = true;
        $("doneSection").hidden = false;
      })
      .catch((err) => {
        showStatus("error", `등록 중 오류: ${err.message} (완료된 이슈는 다시 등록되지 않아요)`);
        // 일부만 등록됐어도 처음부터 다시 시작할 수 있게 한다
        if (hasDone()) $("doneSection").hidden = false;
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function reset() {
    cards.forEach((card) => {
      card.images.forEach((img) => {
        URL.revokeObjectURL(img.url);
      });
    });
    pendingImages.forEach((img) => {
      URL.revokeObjectURL(img.url);
    });
    pendingImages = [];
    fingerprints = [];
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
  $("backBtn").addEventListener("click", () => {
    $("reviewSection").hidden = true;
    $("paste").focus();
  });
  $("newBtn").addEventListener("click", reset);
  $("split").addEventListener("change", () => {
    if (hasDone()) {
      $("split").checked = !$("split").checked; // 바꾼 체크를 되돌린다
      showStatus("error", BLOCKED_MESSAGE);
      return;
    }
    preview();
  });
  $("useTemplate").addEventListener("click", () => {
    $("paste").value = $("template").textContent;
    $("paste").focus();
  });
  $("paste").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) preview();
  });
  $("remember").addEventListener("change", () => {
    if (!$("remember").checked) storage("clear");
  });
  $("pendingFile").addEventListener("change", (e) => {
    addFiles(e.target.files, { list: pendingImages, container: $("pendingThumbs") });
    e.target.value = "";
  });
  document.addEventListener("paste", (e) => {
    const data = e.clipboardData;
    if (!data?.files) return;
    const images = Array.prototype.filter.call(data.files, (f) => f.type.indexOf("image/") === 0);
    if (images.length === 0) return;
    // 글자 없이 이미지만 붙여넣을 때는 입력칸에 이상한 값이 들어가지 않게 막는다
    if (!data.getData("text/plain")) e.preventDefault();
    addFiles(images, imageTarget());
  });
  ($("password").value ? $("paste") : $("password")).focus();
})();
