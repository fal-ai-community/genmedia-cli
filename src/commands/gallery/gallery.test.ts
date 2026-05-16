import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearGallery,
  galleryDir,
  galleryPaths,
  LABEL_MAX_LENGTH,
  listSessions,
  type RecordRunInput,
  readLastSession,
  recordRun,
  regenerateRootIndexHtml,
  regenerateSessionHtml,
  renameSession,
  resolveLatestSessionId,
  rootIndexPath,
  rootIndexUrl,
  sessionsDir,
  setGalleryRoot,
} from "../../lib/gallery";
import type { SessionContext } from "../../lib/session";
import { parseLimit } from "./list";
import { resolveTarget } from "./shared";

function fakeCtx(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    id: "ctx-session-id",
    source: "fallback",
    agent: "test",
    agentHost: null,
    anchor: "test:1",
    startedAt: 0,
    ...overrides,
  };
}

function makeRun(suffix = "1"): RecordRunInput {
  return {
    ts: Date.now(),
    request_id: `req-${suffix}`,
    endpoint_id: "fal-ai/test",
    modality: null,
    prompt: null,
    duration_ms: null,
    files: [
      {
        path: null,
        url: `https://cdn.example.com/${suffix}.png`,
        size_bytes: null,
        kind: "image",
        json_path: `images[${suffix}]`,
      },
    ],
  };
}

describe("parseLimit", () => {
  test("defaults to 50 when undefined or empty", () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit("")).toBe(50);
  });
  test("accepts positive integers", () => {
    expect(parseLimit("1")).toBe(1);
    expect(parseLimit("20")).toBe(20);
  });
  test("returns null for non-positive, non-integer, and non-numeric inputs", () => {
    expect(parseLimit("0")).toBeNull();
    expect(parseLimit("-3")).toBeNull();
    expect(parseLimit("1.5")).toBeNull();
    expect(parseLimit("abc")).toBeNull();
    expect(parseLimit("Infinity")).toBeNull();
    expect(parseLimit("NaN")).toBeNull();
  });
});

describe("resolveTarget (pure paths)", () => {
  test("undefined / empty / 'current' all resolve to current session", () => {
    const ctx = fakeCtx({ id: "sess-abc" });
    for (const t of [undefined, "", "current"]) {
      const r = resolveTarget(t, ctx);
      expect(r.kind).toBe("session");
      if (r.kind === "session") {
        expect(r.session_id).toBe("sess-abc");
        expect(r.source).toBe("current");
      }
    }
  });

  test("'index' resolves to the all-sessions index target", () => {
    const r = resolveTarget("index", fakeCtx());
    expect(r.kind).toBe("index");
    if (r.kind === "index") {
      expect(r.url.startsWith("file://")).toBe(true);
      expect(r.path.endsWith("index.html")).toBe(true);
    }
  });

  test("unknown string is treated as an explicit session id (not validated)", () => {
    const r = resolveTarget("doesnt-exist-xyz", fakeCtx());
    expect(r.kind).toBe("session");
    if (r.kind === "session") {
      expect(r.source).toBe("explicit");
      expect(r.session_id).toBe("doesnt-exist-xyz");
    }
  });
});

describe("gallery storage (redirected root)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "genmedia-gallery-test-"));
    setGalleryRoot(tmp);
  });

  afterAll(() => {
    setGalleryRoot(null);
  });

  test("path helpers honor the override", () => {
    expect(galleryDir()).toBe(tmp);
    expect(sessionsDir()).toBe(join(tmp, "sessions"));
    expect(rootIndexPath()).toBe(join(tmp, "index.html"));
    expect(rootIndexUrl().startsWith("file://")).toBe(true);
    expect(rootIndexUrl().endsWith("/index.html")).toBe(true);
  });

  test("readLastSession + resolveLatestSessionId return null on empty root", () => {
    expect(readLastSession()).toBeNull();
    expect(resolveLatestSessionId()).toBeNull();
  });

  test("resolveTarget('latest') errors out when no sessions exist", () => {
    const r = resolveTarget("latest", fakeCtx());
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.reason).toBe("latest-empty");
    }
  });

  test("recordRun stamps the last-session pointer", () => {
    const paths = recordRun(makeRun("a"));
    expect(paths).not.toBeNull();
    const last = readLastSession();
    expect(last).not.toBeNull();
    expect(last?.session_id).toBe(paths?.session_id ?? "");
    expect(typeof last?.updated_at).toBe("number");
  });

  test("resolveLatestSessionId resolves to the just-recorded session", () => {
    const paths = recordRun(makeRun("a"));
    const id = resolveLatestSessionId();
    expect(id).toBe(paths?.session_id ?? null);
    // And resolveTarget('latest') is no longer an error.
    const r = resolveTarget("latest", fakeCtx({ id: "unrelated" }));
    expect(r.kind).toBe("session");
    if (r.kind === "session") {
      expect(r.source).toBe("latest");
      expect(r.session_id).toBe(paths?.session_id ?? "");
    }
  });

  test("clearGallery({ all: true }) drops pointer and clears every session", () => {
    recordRun(makeRun("a"));
    expect(readLastSession()).not.toBeNull();
    const before = listSessions();
    expect(before.length).toBeGreaterThan(0);

    const result = clearGallery({ all: true });
    expect(result.cleared.length).toBe(before.length);
    expect(readLastSession()).toBeNull();
    expect(listSessions().length).toBe(0);
  });

  test("clearGallery({ sessionId }) only drops pointer when ids match", () => {
    const paths = recordRun(makeRun("a"));
    const id = paths?.session_id ?? "";

    // Clearing a different id leaves the pointer alone.
    clearGallery({ sessionId: "some-other-id" });
    expect(readLastSession()?.session_id).toBe(id);

    // Clearing the pointed-to id removes the pointer.
    clearGallery({ sessionId: id });
    expect(readLastSession()).toBeNull();
  });

  test("regenerateSessionHtml rewrites stale HTML from data.json", () => {
    const paths = recordRun(makeRun("a"));
    const id = paths?.session_id ?? "";

    // Simulate a stale HTML left over from an older CLI version.
    const sessionPaths = galleryPaths(id);
    writeFileSync(sessionPaths.index_path, "<!-- stale -->", "utf-8");
    expect(readFileSync(sessionPaths.index_path, "utf-8")).toBe(
      "<!-- stale -->",
    );

    expect(regenerateSessionHtml(id)).toBe(true);
    const fresh = readFileSync(sessionPaths.index_path, "utf-8");
    expect(fresh).toStartWith("<!doctype html>");
    expect(fresh).toContain(`"session_id":"${id}"`);
  });

  test("regenerateSessionHtml is a no-op for unknown ids", () => {
    expect(regenerateSessionHtml("never-recorded")).toBe(false);
  });

  test("regenerateRootIndexHtml rewrites the root index", () => {
    recordRun(makeRun("a"));
    writeFileSync(rootIndexPath(), "<!-- stale root -->", "utf-8");
    expect(readFileSync(rootIndexPath(), "utf-8")).toBe("<!-- stale root -->");

    expect(regenerateRootIndexHtml()).toBe(true);
    const fresh = readFileSync(rootIndexPath(), "utf-8");
    expect(fresh).toStartWith("<!doctype html>");
    expect(fresh).toContain('id="sessions-grid"');
  });

  test("listSessions previews mix image/video/audio, capped at 4, excludes 3d/other", () => {
    // 2 images, 1 video, 1 audio, 2 more images, 1 model. previews
    // should be FIFO across image+video+audio, model skipped, capped at 4.
    recordRun(makeRun("img-a"));
    recordRun(makeRun("img-b"));
    recordRun({
      ts: Date.now(),
      request_id: "vid-1",
      endpoint_id: "fal-ai/test",
      modality: null,
      prompt: null,
      duration_ms: null,
      files: [
        {
          path: "/tmp/clip.mp4",
          url: "https://cdn.example.com/clip.mp4",
          size_bytes: null,
          kind: "video",
          json_path: "video",
        },
      ],
    });
    recordRun({
      ts: Date.now(),
      request_id: "audio-1",
      endpoint_id: "fal-ai/test",
      modality: null,
      prompt: null,
      duration_ms: null,
      files: [
        {
          path: null,
          url: "https://cdn.example.com/voice.mp3",
          size_bytes: null,
          kind: "audio",
          json_path: "audio[0]",
        },
      ],
    });
    recordRun(makeRun("img-c")); // pushes over the 4-cap
    recordRun(makeRun("img-d"));
    recordRun({
      ts: Date.now(),
      request_id: "model-1",
      endpoint_id: "fal-ai/test",
      modality: null,
      prompt: null,
      duration_ms: null,
      files: [
        {
          path: null,
          url: "https://cdn.example.com/asset.glb",
          size_bytes: null,
          kind: "model",
          json_path: "model",
        },
      ],
    });

    const previews = listSessions()[0].previews;
    expect(previews.length).toBe(4);
    expect(previews.map((p) => p.kind)).toEqual([
      "image",
      "image",
      "video",
      "audio",
    ]);
    expect(previews.every((p) => !p.url.endsWith(".glb"))).toBe(true);
  });

  test("renameSession sets, trims, clears, and exposes label via listSessions", () => {
    const paths = recordRun(makeRun("a"));
    const id = paths?.session_id ?? "";

    // Set
    const ok = renameSession(id, "  fluffy dog batch  ");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.label).toBe("fluffy dog batch");
    expect(listSessions()[0].label).toBe("fluffy dog batch");

    // Clear via null
    const cleared = renameSession(id, null);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.label).toBeNull();
    expect(listSessions()[0].label).toBeNull();

    // Clear via empty string
    renameSession(id, "x");
    const cleared2 = renameSession(id, "   ");
    expect(cleared2.ok).toBe(true);
    if (cleared2.ok) expect(cleared2.label).toBeNull();
  });

  test("renameSession rejects too-long labels and unknown ids", () => {
    const paths = recordRun(makeRun("a"));
    const id = paths?.session_id ?? "";

    const tooLong = renameSession(id, "x".repeat(LABEL_MAX_LENGTH + 1));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.reason).toBe("too-long");

    const missing = renameSession("does-not-exist", "anything");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("not-found");
  });

  test("GENMEDIA_NO_GALLERY blocks writes but not reads/clears", () => {
    recordRun(makeRun("a"));
    expect(listSessions().length).toBe(1);

    const prev = process.env.GENMEDIA_NO_GALLERY;
    process.env.GENMEDIA_NO_GALLERY = "1";
    try {
      // Reads still work — that's the whole point of the fix.
      expect(listSessions().length).toBe(1);
      expect(readLastSession()).not.toBeNull();

      // Writes are refused.
      const blocked = recordRun(makeRun("b"));
      expect(blocked).toBeNull();
      expect(listSessions().length).toBe(1);

      // Clear remains available so users can purge after disabling.
      const cleared = clearGallery({ all: true });
      expect(cleared.cleared.length).toBe(1);
      expect(listSessions().length).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.GENMEDIA_NO_GALLERY;
      else process.env.GENMEDIA_NO_GALLERY = prev;
    }
  });
});
