/* genmedia gallery — shared client helpers
   Loaded by both the session and the sessions-index pages, before the
   page-specific script. Exposes utilities on window.__genmedia. */

(() => {
  window.__genmedia ??= {};
  const H = window.__genmedia;

  H.readData = () => {
    const node = document.getElementById("genmedia-data");
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (_e) {
      return null;
    }
  };

  H.escapeHtml = (value) => {
    if (value === null || value === undefined) return "";
    return String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  };

  H.formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  H.formatRelative = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
    if (diff < 60 * 60000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 24 * 60 * 60000)
      return `${Math.round(diff / (60 * 60000))}h ago`;
    return `${Math.round(diff / (24 * 60 * 60000))}d ago`;
  };

  H.formatTime = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleString();
  };

  H.formatDuration = (seconds) => {
    if (seconds == null || !Number.isFinite(seconds)) return "";
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  /* Deterministic pseudo-random waveform synth so each audio asset has
     a stable-looking shape across renders. */
  H.generateWaveform = (seed, n, energy) => {
    const key = String(seed || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h = (h ^ key.charCodeAt(i)) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
    const rng = () => {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      return h / 0xffffffff;
    };
    const out = [];
    const e = energy == null ? 0.5 : energy;
    for (let j = 0; j < n; j++) {
      const env = Math.sin((j / n) * Math.PI) * 0.7 + 0.3;
      const noise = 0.4 + rng() * 0.6;
      out.push(Math.min(1, env * noise * (0.5 + e)));
    }
    return out;
  };

  H.copyText = (text) => {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard
        .writeText(text)
        .then(() => {
          H.showToast("Copied");
        })
        .catch(() => {
          fallbackCopy(text);
        });
    }
    fallbackCopy(text);
    return Promise.resolve();
  };

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      H.showToast("Copied");
    } catch (_e) {
      /* ignore */
    }
    document.body.removeChild(ta);
  }

  let toastTimer = null;
  H.showToast = (text) => {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      el.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
        '<span class="toast-text"></span>';
      document.body.appendChild(el);
    }
    const t = el.querySelector(".toast-text") || el;
    t.textContent = text;
    el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 1800);
  };

  /* Prefer the locally-downloaded file as a file:// URL so the gallery
     works offline; fall back to the remote URL when no local copy exists. */
  H.preferredSrc = (asset) => {
    if (asset?.file) {
      const parts = String(asset.file).split("/").map(encodeURIComponent);
      return `file://${parts.join("/")}`;
    }
    return asset?.url ? asset.url : "";
  };

  /* ---------- Type metadata ------------------------------------------- */
  H.TYPE_INFO = {
    image: { label: "image", color: "#a1a1aa" },
    video: { label: "video", color: "#a855f7" },
    audio: { label: "audio", color: "#14cbf3" },
    model: { label: "3d", color: "#adff00" },
    other: { label: "other", color: "#787881" },
  };

  H.typeLabel = (kind, n) => {
    const plural = {
      image: "images",
      video: "videos",
      audio: "audio",
      model: "3d",
      other: "other",
    };
    const single = {
      image: "image",
      video: "video",
      audio: "audio",
      model: "3d",
      other: "other",
    };
    return `${n} ${n === 1 ? single[kind] || kind : plural[kind] || kind}`;
  };

  /* ---------- Inline SVG icons ---------------------------------------- */
  H.svgPlay = (s) => {
    s = s || 16;
    return (
      '<svg width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
    );
  };
  H.svgCopy = () =>
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  H.svgOpen = () =>
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  H.svgFile = () =>
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  H.svgImage = (s) => {
    s = s || 13;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
  };
  H.svgVideo = (s) => {
    s = s || 13;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/></svg>`;
  };
  H.svgAudio = (s) => {
    s = s || 13;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  };
  H.iconForKind = (kind, size) => {
    if (kind === "image") return H.svgImage(size);
    if (kind === "video") return H.svgVideo(size);
    if (kind === "audio") return H.svgAudio(size);
    if (kind === "model") return H.svgCube(size || 14);
    return H.svgIconFile(size);
  };
  H.svgIconFile = (s) => {
    s = s || 40;
    return (
      '<svg width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>'
    );
  };
  H.svgCube = (s) => {
    s = s || 92;
    return (
      '<svg class="cube" width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M32 6 L56 18 L56 46 L32 58 L8 46 L8 18 Z"/>' +
      '<path d="M32 6 L32 32 L56 18"/>' +
      '<path d="M32 32 L32 58"/>' +
      '<path d="M32 32 L8 18"/>' +
      "</svg>"
    );
  };
})();
