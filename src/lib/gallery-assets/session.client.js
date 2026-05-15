/* genmedia gallery — session page controller (vanilla JS).
   Reads the SessionPayload from <script id="genmedia-data"> and renders
   the filterable grid + lightbox + tweaks panel. */

(() => {
  const H = window.__genmedia;
  let DATA = H.readData() || { runs: [] };

  const FILTERS = ["all", "image", "video", "audio", "model", "other"];

  const state = {
    filter: "all",
    search: "",
    sort: "newest",
    cols: 4,
    density: "comfortable",
    showActions: true,
    theme: "black",
    activeIdx: null,
    activeAudio: null,
  };

  let ALL_ASSETS = flattenAssets(DATA);
  let VIEW = [];

  /* ---------- Adaptation: runs+files -> flat assets -------------------- */
  function flattenAssets(data) {
    const out = [];
    const runs = data.runs || [];
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const files = r.files || [];
      for (let j = 0; j < files.length; j++) {
        const f = files[j];
        const id = `${r.request_id || `r${i}`}:${f.json_path || `f${j}`}`;
        out.push({
          id: id,
          type: f.kind || "other",
          endpoint: r.endpoint_id || "",
          request_id: r.request_id || "",
          prompt: r.prompt || "",
          timestamp: r.ts || 0,
          run: i + 1,
          path: f.json_path || "",
          file: f.path || null,
          size: f.size_bytes,
          url: f.url || "",
          modality: r.modality || null,
          run_duration_ms: r.duration_ms,
          format: inferFormat(f.path, f.url, f.kind),
          waveform: f.kind === "audio" ? H.generateWaveform(id, 64, 0.5) : null,
        });
      }
    }
    return out;
  }

  function falRequestUrl(asset) {
    if (!asset || !asset.endpoint || !asset.request_id) return "";
    return `https://fal.ai/models/${asset.endpoint}/requests/${asset.request_id}`;
  }

  function inferFormat(path, url, kind) {
    const s = path || url || "";
    const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(s);
    if (m) return m[1].toLowerCase();
    return kind === "model" ? "glb" : "";
  }

  /* ---------- Boot ----------------------------------------------------- */
  function boot() {
    renderHeaderChips();
    renderFilters();
    renderBreakdown();
    bindToolbar();
    bindLightbox();
    bindTweaks();
    bindKeyboard();
    setupEditMode();
    applyFilters();
    if (isLive(DATA.updated_at)) startLivePolling();
  }

  /* ---------- Live polling --------------------------------------------- */
  /* When the session is "live" (updated within the last 5 min), poll the
     sidecar data.json so the user sees new runs land without reloading.
     Static-file architecture is preserved — the page just re-fetches its
     own data file via file:// and re-renders. */
  function startLivePolling() {
    const POLL_MS = 5000;
    let intervalId = null;

    function tick() {
      // Skip while hidden or while the lightbox is open (active index would
      // become stale if ALL_ASSETS changed underneath us).
      if (document.hidden || state.activeIdx !== null) return;
      // Live window closed — one final refresh of the header chips so the
      // dot stops glowing, then stop polling.
      if (!isLive(DATA.updated_at)) {
        stopPolling();
        renderHeaderChips();
        return;
      }
      fetch("./data.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((fresh) => {
          if (!fresh || !Array.isArray(fresh.runs)) return;
          const freshTs = fresh.updated_at || 0;
          const curTs = DATA.updated_at || 0;
          if (freshTs <= curTs && fresh.runs.length === DATA.runs.length) {
            return;
          }
          DATA = fresh;
          ALL_ASSETS = flattenAssets(DATA);
          renderHeaderChips();
          renderFilters();
          renderBreakdown();
          applyFilters();
        })
        .catch(() => {
          // Network / parse errors are non-fatal — just try again next tick.
        });
    }

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
    }

    function onVisibility() {
      if (!document.hidden) tick();
    }

    intervalId = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }

  /* ---------- Header --------------------------------------------------- */
  function renderHeaderChips() {
    const chips = document.getElementById("header-chips");
    if (!chips) return;
    const parts = [];
    if (DATA.session_id) {
      parts.push(
        `<span class="chip mono">${H.escapeHtml(DATA.session_id)}</span>`,
      );
    }
    if (DATA.agent || DATA.agent_host) {
      const agentLabel = [DATA.agent, DATA.agent_host]
        .filter(Boolean)
        .join(" \u00B7 ");
      const live = isLive(DATA.updated_at);
      parts.push(
        '<span class="chip">' +
          '<span class="dot' +
          (live ? " live" : "") +
          '"></span>' +
          H.escapeHtml(agentLabel) +
          "</span>",
      );
    }
    const rangeLabel = formatRangeLabel(DATA);
    if (rangeLabel) {
      parts.push(`<span class="chip mono">${H.escapeHtml(rangeLabel)}</span>`);
    }
    chips.innerHTML = parts.join("");
  }

  function formatRangeLabel(data) {
    if (!data.runs || !data.runs.length) return "no runs yet";
    const first = new Date(data.started_at || data.updated_at || Date.now());
    const n = data.runs.length;
    return (
      first.toLocaleDateString() +
      " \u00B7 " +
      n +
      " run" +
      (n === 1 ? "" : "s")
    );
  }

  function isLive(ts) {
    if (!ts) return false;
    return Date.now() - ts < 5 * 60 * 1000;
  }

  /* ---------- Filters / search / sort --------------------------------- */
  function countByType(arr) {
    const r = {};
    for (let i = 0; i < arr.length; i++)
      r[arr[i].type] = (r[arr[i].type] || 0) + 1;
    return r;
  }

  function renderFilters() {
    const root = document.getElementById("filters");
    if (!root) return;
    const counts = countByType(ALL_ASSETS);
    let html = "";
    for (let i = 0; i < FILTERS.length; i++) {
      const f = FILTERS[i];
      const n = f === "all" ? ALL_ASSETS.length : counts[f] || 0;
      html +=
        '<button class="fc" data-filter="' +
        f +
        '" aria-pressed="' +
        (state.filter === f ? "true" : "false") +
        '"><span>' +
        f +
        '</span><span class="count">' +
        n +
        "</span></button>";
    }
    root.innerHTML = html;
    root.querySelectorAll(".fc").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filter = btn.dataset.filter;
        root.querySelectorAll(".fc").forEach((b) => {
          b.setAttribute(
            "aria-pressed",
            b.dataset.filter === state.filter ? "true" : "false",
          );
        });
        applyFilters();
      });
    });
  }

  function renderBreakdown() {
    const root = document.getElementById("breakdown");
    if (!root) return;
    const counts = countByType(ALL_ASSETS);
    const order = ["image", "video", "audio", "model", "other"];
    let html = "";
    for (let i = 0; i < order.length; i++) {
      const t = order[i];
      if (!counts[t]) continue;
      const c = (H.TYPE_INFO[t] || H.TYPE_INFO.other).color;
      html +=
        '<span class="b"><span class="sw" style="background:' +
        c +
        '"></span>' +
        H.typeLabel(t, counts[t]) +
        "</span>";
    }
    root.innerHTML = html;
  }

  function bindToolbar() {
    const search = document.getElementById("search-input");
    if (search) {
      search.addEventListener("input", (e) => {
        state.search = e.target.value.trim().toLowerCase();
        applyFilters();
      });
    }
    const sortSel = document.getElementById("sort-select");
    if (sortSel) {
      sortSel.addEventListener("change", (e) => {
        state.sort = e.target.value;
        applyFilters();
      });
    }
  }

  function applyFilters() {
    let arr = ALL_ASSETS;
    if (state.filter !== "all") {
      arr = arr.filter((a) => a.type === state.filter);
    }
    if (state.search) {
      const q = state.search;
      arr = arr.filter(
        (a) =>
          (a.prompt && a.prompt.toLowerCase().indexOf(q) !== -1) ||
          (a.endpoint && a.endpoint.toLowerCase().indexOf(q) !== -1) ||
          (a.file && a.file.toLowerCase().indexOf(q) !== -1) ||
          (a.path && a.path.toLowerCase().indexOf(q) !== -1),
      );
    }
    const cmp = {
      newest: (a, b) => b.timestamp - a.timestamp,
      oldest: (a, b) => a.timestamp - b.timestamp,
      "size-desc": (a, b) => (b.size || 0) - (a.size || 0),
      "size-asc": (a, b) => (a.size || 0) - (b.size || 0),
      endpoint: (a, b) => (a.endpoint || "").localeCompare(b.endpoint || ""),
    }[state.sort];
    arr = arr.slice().sort(cmp);
    VIEW = arr;
    const shown = document.getElementById("stat-shown");
    const total = document.getElementById("stat-total");
    if (shown) shown.textContent = String(arr.length);
    if (total) total.textContent = String(ALL_ASSETS.length);
    renderGrid();
  }

  /* ---------- Grid + card rendering ----------------------------------- */
  function renderGrid() {
    const grid = document.getElementById("grid");
    if (!grid) return;
    grid.style.setProperty("--cols", state.cols);
    grid.innerHTML = "";

    if (!VIEW.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML =
        '<div class="em-title">' +
        (ALL_ASSETS.length === 0
          ? "No assets generated in this session yet."
          : "No matches.") +
        "</div>" +
        '<div class="em-sub">' +
        (state.search
          ? `query "${H.escapeHtml(state.search)}"`
          : `filter: ${state.filter}`) +
        "</div>";
      grid.appendChild(empty);
      return;
    }
    for (let i = 0; i < VIEW.length; i++) {
      grid.appendChild(renderCard(VIEW[i], i));
    }
  }

  function renderCard(asset, idx) {
    const el = document.createElement("article");
    el.className = "card";
    el.tabIndex = 0;
    el.dataset.id = asset.id;
    el.dataset.type = asset.type;

    const ti = H.TYPE_INFO[asset.type] || H.TYPE_INFO.other;

    const preview = document.createElement("div");
    preview.className = "preview";
    const src = H.preferredSrc(asset);

    const badge =
      '<div class="type-badge"><span class="sw" style="background:' +
      ti.color +
      '"></span>' +
      ti.label +
      "</div>";

    if (asset.type === "image" && src) {
      preview.innerHTML = `<img src="${H.escapeHtml(src)}" alt="" loading="lazy" />${badge}`;
    } else if (asset.type === "video" && src) {
      preview.innerHTML =
        '<video preload="metadata" muted playsinline src="' +
        H.escapeHtml(src) +
        '#t=0.1"></video>' +
        badge +
        '<div class="play-overlay"><div class="ring">' +
        H.svgPlay(20) +
        "</div></div>";
    } else if (asset.type === "audio") {
      preview.appendChild(renderAudioStage(asset));
      const b = document.createElement("div");
      b.className = "type-badge";
      b.innerHTML =
        '<span class="sw" style="background:' +
        ti.color +
        '"></span>' +
        ti.label;
      preview.appendChild(b);
    } else if (asset.type === "model") {
      preview.innerHTML =
        '<div class="model-stage">' +
        H.svgCube(92) +
        (asset.format
          ? `<div class="fmt">${H.escapeHtml(asset.format)}</div>`
          : "") +
        "</div>" +
        badge;
    } else {
      preview.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--fg-faint);">' +
        H.svgIconFile(40) +
        "</div>" +
        badge;
    }

    const body = document.createElement("div");
    body.className = `body${state.density === "compact" ? " compact" : ""}`;
    // Short request id for the meta-row. Cards stay scannable; the full id
    // sits in title= for hover and is also shown in the lightbox.
    const reqShort =
      asset.request_id && asset.request_id.length > 10
        ? `${asset.request_id.slice(0, 8)}\u2026`
        : asset.request_id || "";
    body.innerHTML =
      '<div class="endpoint" title="' +
      H.escapeHtml(asset.endpoint) +
      '">' +
      H.escapeHtml(asset.endpoint) +
      "</div>" +
      // Skip the prompt element entirely when empty \u2014 the placeholder line
      // was eating vertical space without adding signal. Cards in the same
      // grid row may have different heights now; that's acceptable.
      (asset.prompt
        ? `<p class="prompt">${H.escapeHtml(asset.prompt)}</p>`
        : "") +
      '<div class="meta-row">' +
      '<span class="left">' +
      `<span>${H.escapeHtml(H.formatRelative(asset.timestamp))}</span>` +
      (reqShort
        ? `<span class="sep">\u00B7</span><span class="req" title="${H.escapeHtml(asset.request_id)}">${H.escapeHtml(reqShort)}</span>`
        : "") +
      "</span>" +
      '<span class="right">' +
      `<span>${H.escapeHtml(asset.path)}</span>` +
      (asset.size
        ? `<span class="sep">\u00B7</span><span>${H.escapeHtml(H.formatBytes(asset.size))}</span>`
        : "") +
      "</span></div>";

    const actions = document.createElement("div");
    actions.className = "actions";
    if (!state.showActions) actions.hidden = true;
    let actHtml = "";
    const falUrl = falRequestUrl(asset);
    if (falUrl) {
      actHtml +=
        '<a class="action-btn" data-act="open-fal" href="' +
        H.escapeHtml(falUrl) +
        '" target="_blank" rel="noopener">' +
        H.svgOpen() +
        " View on fal.ai</a>";
    }
    if (asset.url) {
      actHtml +=
        '<button type="button" class="action-btn" data-act="copy-url">' +
        H.svgCopy() +
        " Copy URL</button>";
      actHtml +=
        '<a class="action-btn" data-act="open-original" href="' +
        H.escapeHtml(asset.url) +
        '" target="_blank" rel="noopener">' +
        H.svgOpen() +
        " Open original</a>";
    }
    if (asset.file) {
      actHtml +=
        '<a class="action-btn" data-act="open-file" href="' +
        H.escapeHtml(H.preferredSrc(asset)) +
        '" target="_blank" rel="noopener">' +
        H.svgFile() +
        " Open file</a>";
    }
    actions.innerHTML = actHtml;

    el.append(preview, body, actions);

    el.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".action-btn");
      if (btn && btn.dataset.act === "copy-url") {
        H.copyText(asset.url);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (btn) {
        e.stopPropagation();
        return;
      }
      if (e.target.closest?.(".audio-stage .play-btn")) {
        e.stopPropagation();
        return;
      }
      openLightbox(idx);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(idx);
      }
    });

    return el;
  }

  function renderAudioStage(asset) {
    const wrap = document.createElement("div");
    wrap.className = "audio-stage";
    wrap.dataset.id = asset.id;
    const endpointTail =
      (asset.endpoint || "").split("/").slice(-1)[0] || "audio";

    wrap.innerHTML =
      '<div class="label">audio \u00B7 ' +
      H.escapeHtml(endpointTail) +
      "</div>" +
      '<div class="wave"></div>' +
      '<button class="play-btn" type="button" aria-label="Preview">' +
      H.svgPlay(14) +
      "</button>";

    const wave = wrap.querySelector(".wave");
    const bars = asset.waveform || H.generateWaveform(asset.id, 64, 0.5);
    const barFrag = document.createDocumentFragment();
    for (let i = 0; i < bars.length; i++) {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.max(8, bars[i] * 100)}%`;
      barFrag.appendChild(bar);
    }
    wave.appendChild(barFrag);

    const src = H.preferredSrc(asset);
    const audio = document.createElement("audio");
    audio.src = src;
    audio.preload = "none";
    audio.style.display = "none";
    wrap.appendChild(audio);

    wrap.addEventListener("mousemove", (e) => {
      if (!audio.paused) return;
      const rect = wave.getBoundingClientRect();
      const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const allBars = wrap.querySelectorAll(".wave .bar");
      allBars.forEach((b, idx2) => {
        b.classList.toggle("played", idx2 / allBars.length <= r);
      });
    });
    wrap.addEventListener("mouseleave", () => {
      if (!audio.paused) return;
      wrap.querySelectorAll(".wave .bar").forEach((b) => {
        b.classList.remove("played");
      });
    });

    wrap.querySelector(".play-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (audio.paused) {
        if (state.activeAudio && state.activeAudio !== audio) {
          state.activeAudio.pause();
        }
        state.activeAudio = audio;
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("timeupdate", () => {
      const t = audio.duration ? audio.currentTime / audio.duration : 0;
      const allBars = wrap.querySelectorAll(".wave .bar");
      allBars.forEach((b, idx2) => {
        b.classList.toggle("played", idx2 / allBars.length <= t);
      });
    });
    audio.addEventListener("ended", () => {
      const allBars = wrap.querySelectorAll(".wave .bar");
      allBars.forEach((b) => {
        b.classList.add("played");
      });
    });

    return wrap;
  }

  /* ---------- Lightbox ------------------------------------------------- */
  function bindLightbox() {
    const lb = document.getElementById("lightbox");
    if (!lb) return;
    document
      .getElementById("lb-close")
      .addEventListener("click", closeLightbox);
    document.getElementById("lb-prev").addEventListener("click", () => {
      navLightbox(-1);
    });
    document.getElementById("lb-next").addEventListener("click", () => {
      navLightbox(1);
    });
    lb.addEventListener("click", (e) => {
      if (e.target === lb) closeLightbox();
    });
  }

  function openLightbox(idx) {
    state.activeIdx = idx;
    renderLightbox();
    document.getElementById("lightbox").setAttribute("data-open", "true");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    const lb = document.getElementById("lightbox");
    lb.setAttribute("data-open", "false");
    document.body.style.overflow = "";
    state.activeIdx = null;
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio = null;
    }
    document.getElementById("lb-preview").innerHTML = "";
  }

  function navLightbox(dir) {
    if (state.activeIdx == null) return;
    let n = state.activeIdx + dir;
    if (n < 0) n = VIEW.length - 1;
    if (n >= VIEW.length) n = 0;
    state.activeIdx = n;
    renderLightbox();
  }

  function renderLightbox() {
    const asset = VIEW[state.activeIdx];
    if (!asset) return;
    const preview = document.getElementById("lb-preview");
    const meta = document.getElementById("lb-meta");
    preview.innerHTML = "";
    meta.innerHTML = "";

    const src = H.preferredSrc(asset);

    if (asset.type === "image" && src) {
      preview.innerHTML =
        '<img src="' +
        H.escapeHtml(src) +
        '" alt="' +
        H.escapeHtml(asset.prompt) +
        '" />';
    } else if (asset.type === "video" && src) {
      preview.innerHTML =
        '<video controls autoplay playsinline src="' +
        H.escapeHtml(src) +
        '"></video>';
    } else if (asset.type === "audio") {
      const wfHtml = (asset.waveform || H.generateWaveform(asset.id, 96, 0.6))
        .map(
          (v) =>
            '<div class="bar" style="height:' +
            Math.max(10, v * 100) +
            '%"></div>',
        )
        .join("");
      const endpointTail =
        (asset.endpoint || "").split("/").slice(-1)[0] || "audio";
      preview.innerHTML =
        '<div class="lb-audio">' +
        '<div style="font-family:var(--font-mono);color:var(--fg-subtle);font-size:11px;letter-spacing:.05em;text-transform:uppercase;">audio waveform \u00B7 ' +
        H.escapeHtml(endpointTail) +
        "</div>" +
        '<div class="lb-wave">' +
        wfHtml +
        "</div>" +
        (src
          ? '<audio controls preload="metadata" src="' +
            H.escapeHtml(src) +
            '"></audio>'
          : "") +
        "</div>";
      const audio = preview.querySelector("audio");
      const bars = preview.querySelectorAll(".lb-wave .bar");
      if (audio) {
        audio.addEventListener("timeupdate", () => {
          const t = audio.duration ? audio.currentTime / audio.duration : 0;
          bars.forEach((b, i) => {
            b.classList.toggle("played", i / bars.length <= t);
          });
        });
        audio.addEventListener("ended", () => {
          bars.forEach((b) => {
            b.classList.add("played");
          });
        });
        state.activeAudio = audio;
      }
    } else if (asset.type === "model") {
      preview.innerHTML =
        '<div class="lb-model">' +
        '<svg width="220" height="220" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M32 6 L56 18 L56 46 L32 58 L8 46 L8 18 Z"/>' +
        '<path d="M32 6 L32 32 L56 18"/>' +
        '<path d="M32 32 L32 58"/>' +
        '<path d="M32 32 L8 18"/>' +
        "</svg>" +
        (asset.format
          ? `<div class="fmt">${H.escapeHtml(asset.format)}</div>`
          : "") +
        "</div>";
    } else {
      preview.innerHTML =
        '<div style="color:var(--fg-faint);display:flex;align-items:center;justify-content:center;width:100%;">' +
        H.svgIconFile(80) +
        "</div>";
    }

    let fields = "";
    fields +=
      '<div class="field"><span class="k">type</span><span class="v">' +
      H.escapeHtml(asset.type) +
      (asset.format ? ` \u00B7 ${H.escapeHtml(asset.format)}` : "") +
      "</span></div>";
    if (asset.size) {
      fields +=
        '<div class="field"><span class="k">size</span><span class="v">' +
        H.escapeHtml(H.formatBytes(asset.size)) +
        "</span></div>";
    }
    fields +=
      '<div class="field"><span class="k">run</span><span class="v">#' +
      asset.run +
      "</span></div>";
    if (asset.request_id) {
      fields +=
        '<div class="field"><span class="k">request id</span><span class="v">' +
        H.escapeHtml(asset.request_id) +
        "</span></div>";
    }
    fields +=
      '<div class="field"><span class="k">timestamp</span><span class="v">' +
      H.escapeHtml(H.formatTime(asset.timestamp)) +
      "</span></div>";
    if (asset.modality) {
      fields +=
        '<div class="field"><span class="k">modality</span><span class="v">' +
        H.escapeHtml(asset.modality) +
        "</span></div>";
    }
    if (asset.run_duration_ms) {
      fields +=
        '<div class="field"><span class="k">run latency</span><span class="v">' +
        (asset.run_duration_ms / 1000).toFixed(2) +
        "s</span></div>";
    }
    fields +=
      '<div class="field"><span class="k">json path</span><span class="v">' +
      H.escapeHtml(asset.path) +
      "</span></div>";
    if (asset.file) {
      fields +=
        '<div class="field"><span class="k">file</span><span class="v">' +
        H.escapeHtml(asset.file) +
        "</span></div>";
    }
    if (asset.url) {
      fields +=
        '<div class="field"><span class="k">url</span><span class="v">' +
        H.escapeHtml(asset.url) +
        "</span></div>";
    }

    let actions = "";
    const falUrl = falRequestUrl(asset);
    if (falUrl) {
      actions +=
        '<a class="primary" href="' +
        H.escapeHtml(falUrl) +
        '" target="_blank" rel="noopener">' +
        H.svgOpen() +
        " View on fal.ai</a>";
    }
    if (asset.url) {
      actions +=
        "<a" +
        (falUrl ? "" : ' class="primary"') +
        ' href="' +
        H.escapeHtml(asset.url) +
        '" target="_blank" rel="noopener">' +
        H.svgOpen() +
        " Open original</a>";
      actions +=
        '<button type="button" data-act="copy-url">' +
        H.svgCopy() +
        " Copy URL</button>";
    }
    if (asset.file) {
      actions +=
        '<a href="' +
        H.escapeHtml(src) +
        '" target="_blank" rel="noopener">' +
        H.svgFile() +
        " Open file</a>";
    }
    if (asset.prompt) {
      actions +=
        '<button type="button" data-act="copy-prompt">' +
        H.svgCopy() +
        " Copy prompt</button>";
    }

    meta.innerHTML =
      '<div><h2>Endpoint</h2><div class="endpoint-big">' +
      H.escapeHtml(asset.endpoint) +
      "</div></div>" +
      '<div><h2>Prompt</h2><p class="prompt-big' +
      (asset.prompt ? "" : " empty") +
      '">' +
      (asset.prompt ? H.escapeHtml(asset.prompt) : "(no prompt)") +
      "</p></div>" +
      "<div><h2>Details</h2>" +
      fields +
      "</div>" +
      '<div class="lb-actions">' +
      actions +
      "</div>";

    meta.querySelectorAll("[data-act]").forEach((b) => {
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        if (act === "copy-url" && asset.url) H.copyText(asset.url);
        else if (act === "copy-prompt" && asset.prompt)
          H.copyText(asset.prompt);
      });
    });
  }

  /* ---------- Keyboard ------------------------------------------------- */
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      const lb = document.getElementById("lightbox");
      const lbOpen = lb && lb.getAttribute("data-open") === "true";
      if (lbOpen) {
        if (e.key === "Escape") closeLightbox();
        else if (e.key === "ArrowLeft") navLightbox(-1);
        else if (e.key === "ArrowRight") navLightbox(1);
        return;
      }
      const search = document.getElementById("search-input");
      if (e.key === "/" && document.activeElement !== search) {
        e.preventDefault();
        if (search) search.focus();
      } else if (e.key === "Escape" && document.activeElement === search) {
        search.value = "";
        state.search = "";
        applyFilters();
        search.blur();
      }
    });
  }

  /* ---------- Tweaks panel -------------------------------------------- */
  function bindTweaks() {
    const btn = document.getElementById("tweaks-btn");
    const panel = document.getElementById("tweaks");
    const close = document.getElementById("tw-close");
    if (!btn || !panel || !close) return;
    btn.addEventListener("click", () => {
      setTweaksOpen(true);
    });
    close.addEventListener("click", () => {
      setTweaksOpen(false);
    });

    bindSeg("tw-cols", (v) => {
      state.cols = parseInt(v, 10) || 4;
      renderGrid();
    });
    bindSeg("tw-density", (v) => {
      state.density = v;
      renderGrid();
    });
    bindSeg("tw-theme", (v) => {
      state.theme = v;
      applyTheme();
    });
    const actionsToggle = document.getElementById("tw-actions");
    if (actionsToggle) {
      actionsToggle.addEventListener("change", (e) => {
        state.showActions = e.target.checked;
        renderGrid();
      });
    }
  }

  function bindSeg(rootId, onChange) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        root.querySelectorAll("button").forEach((x) => {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        onChange(b.dataset.v);
      });
    });
  }

  function setTweaksOpen(open) {
    const panel = document.getElementById("tweaks");
    const btn = document.getElementById("tweaks-btn");
    if (panel) panel.setAttribute("data-open", open ? "true" : "false");
    if (btn) btn.hidden = open;
    if (!open && window.parent !== window) {
      window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
    }
  }

  function applyTheme() {
    if (state.theme === "default") document.body.removeAttribute("data-theme");
    else document.body.setAttribute("data-theme", state.theme);
  }

  /* Edit-mode protocol (host pages can toggle the tweaks panel via postMessage). */
  function setupEditMode() {
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "__activate_edit_mode") setTweaksOpen(true);
      else if (d.type === "__deactivate_edit_mode") setTweaksOpen(false);
    });
    if (window.parent !== window) {
      window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    } else {
      const btn = document.getElementById("tweaks-btn");
      if (btn) btn.hidden = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
