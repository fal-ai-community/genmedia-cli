import { describe, expect, test } from "bun:test";
import {
  BAKED_IN,
  type DefaultsManifest,
  decideResolution,
  isValidManifest,
  TTL_MS,
} from "./defaults-manifest";

const NOW = 1_700_000_000_000;

const fetchedManifest: DefaultsManifest = {
  version: 1,
  defaults: {
    "text-to-image": "fal-ai/server-side-default-image",
    "text-to-video": "fal-ai/server-side-default-video",
    "text-to-audio-music": "fal-ai/server-side-default-music",
    "text-to-audio-tts": "fal-ai/server-side-default-tts",
    "text-to-3d": "fal-ai/server-side-default-3d",
  },
};

const cachedManifest: DefaultsManifest = {
  version: 1,
  defaults: {
    "text-to-image": "fal-ai/cached-default-image",
    "text-to-video": "fal-ai/cached-default-video",
    "text-to-audio-music": "fal-ai/cached-default-music",
    "text-to-audio-tts": "fal-ai/cached-default-tts",
    "text-to-3d": "fal-ai/cached-default-3d",
  },
};

describe("decideResolution — cache hit path", () => {
  test("uses fresh cache, no save", () => {
    const out = decideResolution({
      modality: "text-to-image",
      cached: { fetchedAt: NOW - 1000, manifest: cachedManifest },
      fetched: null,
      now: NOW,
    });
    expect(out.result.endpoint_id).toBe("fal-ai/cached-default-image");
    expect(out.result.source).toBe("cached");
    expect(out.saveCache).toBeUndefined();
  });
});

describe("decideResolution — manifest fetch path", () => {
  test("uses fetched manifest when cache is missing, schedules save", () => {
    const out = decideResolution({
      modality: "text-to-video",
      cached: undefined,
      fetched: fetchedManifest,
      now: NOW,
    });
    expect(out.result.endpoint_id).toBe("fal-ai/server-side-default-video");
    expect(out.result.source).toBe("manifest");
    expect(out.saveCache).toEqual({
      fetchedAt: NOW,
      manifest: fetchedManifest,
    });
  });

  test("fetched manifest overrides stale cache", () => {
    const out = decideResolution({
      modality: "text-to-image",
      cached: { fetchedAt: NOW - TTL_MS - 1, manifest: cachedManifest },
      fetched: fetchedManifest,
      now: NOW,
    });
    expect(out.result.endpoint_id).toBe("fal-ai/server-side-default-image");
    expect(out.result.source).toBe("manifest");
    expect(out.saveCache).toBeDefined();
  });
});

describe("decideResolution — stale cache fallback", () => {
  test("uses stale cache when fetch fails", () => {
    const out = decideResolution({
      modality: "text-to-image",
      cached: { fetchedAt: NOW - TTL_MS - 1, manifest: cachedManifest },
      fetched: null,
      now: NOW,
    });
    expect(out.result.endpoint_id).toBe("fal-ai/cached-default-image");
    expect(out.result.source).toBe("cached");
    expect(out.saveCache).toBeUndefined();
  });
});

describe("decideResolution — baked-in fallback", () => {
  test("uses BAKED_IN when no cache and fetch fails", () => {
    const out = decideResolution({
      modality: "text-to-image",
      cached: undefined,
      fetched: null,
      now: NOW,
    });
    expect(out.result.endpoint_id).toBe(BAKED_IN.defaults["text-to-image"]);
    expect(out.result.source).toBe("baked-in");
    expect(out.saveCache).toBeUndefined();
  });

  test("uses BAKED_IN when fetched manifest is missing the modality entry", () => {
    const partial = {
      version: 1,
      // intentionally missing "text-to-3d"
      defaults: {
        "text-to-image": "x",
        "text-to-video": "y",
        "text-to-audio-music": "m",
        "text-to-audio-tts": "t",
      },
    } as DefaultsManifest;
    const out = decideResolution({
      modality: "text-to-3d",
      cached: undefined,
      fetched: partial,
      now: NOW,
    });
    expect(out.result.endpoint_id).toBe(BAKED_IN.defaults["text-to-3d"]);
    expect(out.result.source).toBe("baked-in");
  });
});

describe("isValidManifest", () => {
  test("accepts a well-formed v1 manifest", () => {
    expect(isValidManifest(fetchedManifest)).toBe(true);
  });

  test("rejects null and primitives", () => {
    expect(isValidManifest(null)).toBe(false);
    expect(isValidManifest(undefined)).toBe(false);
    expect(isValidManifest("manifest")).toBe(false);
    expect(isValidManifest(42)).toBe(false);
  });

  test("rejects non-v1 versions", () => {
    expect(isValidManifest({ version: 2, defaults: {} })).toBe(false);
  });

  test("rejects manifest without defaults object", () => {
    expect(isValidManifest({ version: 1 })).toBe(false);
    expect(isValidManifest({ version: 1, defaults: null })).toBe(false);
    expect(isValidManifest({ version: 1, defaults: "x" })).toBe(false);
  });
});
