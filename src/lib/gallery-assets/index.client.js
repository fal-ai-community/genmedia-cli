/* genmedia gallery — sessions-index page controller. Reads a
   { sessions: SessionSummary[] } payload from <script id="genmedia-data">. */

(() => {
  const H = window.__genmedia;
  const DATA = H.readData() || { sessions: [] };
  const SESSIONS = (DATA.sessions || []).map(adaptSession);

  const state = { search: "", sort: "newest" };

  function adaptSession(s) {
    const kinds = s.kind_counts || {};
    const assets = s.asset_count || 0;
    return {
      session_id: s.session_id,
      agent: s.agent || null,
      agent_host: s.agent_host || null,
      started_at: s.started_at || 0,
      updated_at: s.updated_at || 0,
      runs: s.run_count || 0,
      assets: assets,
      breakdown: kinds,
      modalities: s.modalities || [],
      previews: Array.isArray(s.previews) ? s.previews : [],
      live: isLive(s.updated_at),
    };
  }

  function isLive(ts) {
    if (!ts) return false;
    return Date.now() - ts < 5 * 60 * 1000;
  }

  function boot() {
    renderHeaderChips();
    bindToolbar();
    bindKeyboard();
    render();
  }

  function renderHeaderChips() {
    const chips = document.getElementById("header-chips");
    if (!chips) return;
    const parts = [];
    const liveCount = SESSIONS.filter((s) => s.live).length;
    if (liveCount > 0) {
      parts.push(
        '<span class="chip"><span class="dot live"></span>' +
          liveCount +
          " live</span>",
      );
    }
    const agents = uniq(SESSIONS.map((s) => s.agent).filter(Boolean));
    if (agents.length) {
      parts.push(
        '<span class="chip">' +
          agents.length +
          " agent" +
          (agents.length === 1 ? "" : "s") +
          "</span>",
      );
    }
    chips.innerHTML = parts.join("");
  }

  function uniq(arr) {
    const seen = {};
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) {
        seen[arr[i]] = true;
        out.push(arr[i]);
      }
    }
    return out;
  }

  function bindToolbar() {
    const search = document.getElementById("search-input");
    if (search) {
      search.addEventListener("input", (e) => {
        state.search = e.target.value.trim();
        render();
      });
    }
    const sortSel = document.getElementById("sort-select");
    if (sortSel) {
      sortSel.addEventListener("change", (e) => {
        state.sort = e.target.value;
        render();
      });
    }
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      const input = document.getElementById("search-input");
      if (!input) return;
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input.value = "";
        state.search = "";
        render();
        input.blur();
      }
    });
  }

  function render() {
    let arr = SESSIONS.slice();
    if (state.search) {
      const q = state.search.toLowerCase();
      arr = arr.filter(
        (s) =>
          s.session_id.toLowerCase().indexOf(q) !== -1 ||
          (s.agent && s.agent.toLowerCase().indexOf(q) !== -1) ||
          (s.agent_host && s.agent_host.toLowerCase().indexOf(q) !== -1),
      );
    }
    const cmp = {
      newest: (a, b) => b.updated_at - a.updated_at,
      oldest: (a, b) => a.updated_at - b.updated_at,
      "assets-desc": (a, b) => b.assets - a.assets,
      "runs-desc": (a, b) => b.runs - a.runs,
    }[state.sort];
    arr.sort(cmp);

    const shown = document.getElementById("stat-shown");
    const total = document.getElementById("stat-total");
    if (shown) shown.textContent = String(arr.length);
    if (total) total.textContent = String(SESSIONS.length);

    renderTotalBreakdown();

    const grid = document.getElementById("sessions-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      if (SESSIONS.length === 0) {
        empty.innerHTML =
          '<div class="em-title">No sessions yet</div>' +
          '<div class="em-sub">Run <code>genmedia run …</code> to generate something.</div>';
      } else {
        empty.innerHTML =
          '<div class="em-title">No matches</div>' +
          '<div class="em-sub">"' +
          H.escapeHtml(state.search) +
          '"</div>';
      }
      grid.appendChild(empty);
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      grid.appendChild(renderCard(arr[i]));
    }
  }

  function renderTotalBreakdown() {
    const root = document.getElementById("breakdown");
    if (!root) return;
    const total = {};
    for (let i = 0; i < SESSIONS.length; i++) {
      const b = SESSIONS[i].breakdown || {};
      for (const k in b) {
        if (Object.hasOwn(b, k)) {
          total[k] = (total[k] || 0) + b[k];
        }
      }
    }
    const order = ["image", "video", "audio", "model", "other"];
    let html = "";
    for (let j = 0; j < order.length; j++) {
      const t = order[j];
      if (!total[t]) continue;
      const c = (H.TYPE_INFO[t] || H.TYPE_INFO.other).color;
      html +=
        '<span class="b"><span class="sw" style="background:' +
        c +
        '"></span>' +
        H.typeLabel(t, total[t]) +
        "</span>";
    }
    root.innerHTML = html;
  }

  function renderCard(s) {
    const el = document.createElement("a");
    el.className = `session-card${s.live ? " live" : ""}`;
    el.href = `./sessions/${encodeURIComponent(s.session_id)}/index.html`;

    const agent =
      [s.agent, s.agent_host].filter(Boolean).join(" \u00B7 ") ||
      "unknown agent";

    const segs = [];
    const breakdownLabels = [];
    const entries = Object.keys(s.breakdown || {})
      .map((k) => [k, s.breakdown[k]])
      .filter((e) => e[1] > 0)
      .sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < entries.length; i++) {
      const k = entries[i][0];
      const n = entries[i][1];
      const c = (H.TYPE_INFO[k] || H.TYPE_INFO.other).color;
      segs.push(`<span style="background:${c}; flex:${n}"></span>`);
      breakdownLabels.push(H.typeLabel(k, n));
    }

    let thumbsHtml = "";
    if (s.previews && s.previews.length) {
      const items = [];
      for (let i = 0; i < s.previews.length; i++) {
        const p = s.previews[i];
        const src = H.preferredSrc(p);
        if (!src) continue;
        const safeSrc = H.escapeHtml(src);
        // First-frame trick: preload only metadata + seek to 0.1s so the
        // browser paints a static poster without streaming the whole file.
        let media;
        if (p.kind === "video") {
          media =
            '<video preload="metadata" muted playsinline src="' +
            safeSrc +
            '#t=0.1"></video><span class="play-badge"><span class="disc">' +
            H.svgPlay(16) +
            "</span></span>";
        } else if (p.kind === "audio") {
          // Synthetic waveform (no audio decode) — keyed off the URL so the
          // shape is stable across renders. Real playback is on the session
          // page; the index thumb is decorative.
          const bars = H.generateWaveform(p.url || p.file || "", 18, 0.55);
          let barsHtml = "";
          for (let b = 0; b < bars.length; b++) {
            barsHtml +=
              '<span class="bar" style="height:' +
              Math.max(12, bars[b] * 100) +
              '%"></span>';
          }
          media =
            '<div class="audio-thumb">' +
            barsHtml +
            '</div><span class="play-badge"><span class="disc">' +
            H.svgPlay(16) +
            "</span></span>";
        } else {
          media = '<img src="' + safeSrc + '" alt="" loading="lazy" />';
        }
        items.push('<span class="thumb">' + media + "</span>");
      }
      if (items.length) {
        thumbsHtml = '<div class="sc-thumbs">' + items.join("") + "</div>";
      }
    }

    el.innerHTML =
      '<div class="sc-top">' +
      '<span class="sc-id">' +
      H.escapeHtml(s.session_id) +
      "</span>" +
      '<span class="chip">' +
      H.escapeHtml(agent) +
      "</span>" +
      "</div>" +
      thumbsHtml +
      '<p class="sc-summary">' +
      "<strong>" +
      s.assets +
      "</strong> " +
      (s.assets === 1 ? "asset" : "assets") +
      " across <strong>" +
      s.runs +
      "</strong> " +
      (s.runs === 1 ? "run" : "runs") +
      (breakdownLabels.length
        ? '<span class="sep">\u00B7</span><span class="breakdown">' +
          H.escapeHtml(breakdownLabels.join(", ")) +
          "</span>"
        : "") +
      "</p>" +
      '<div class="sc-typebar">' +
      segs.join("") +
      "</div>" +
      '<div class="sc-bottom">' +
      "<span>" +
      H.escapeHtml(H.formatRelative(s.updated_at)) +
      "</span>" +
      '<span class="right" title="' +
      H.escapeHtml(H.formatTime(s.started_at)) +
      '">since ' +
      H.escapeHtml(H.formatRelative(s.started_at)) +
      "</span>" +
      "</div>";

    return el;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
