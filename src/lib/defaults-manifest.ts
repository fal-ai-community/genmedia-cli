import {
  type DefaultsManifestCacheEntry,
  loadConfig,
  saveConfig,
} from "./config";
import type { Modality } from "./modality";

const MANIFEST_URL =
  process.env.GENMEDIA_DEFAULTS_URL ?? "https://genmedia.sh/defaults.json";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 1000;

export type DefaultsSource = "manifest" | "cached" | "baked-in";

export interface DefaultsManifest {
  version: 1;
  defaults: Record<Modality, string>;
}

export interface ResolvedDefault {
  endpoint_id: string;
  source: DefaultsSource;
}

// Conservative v1 picks — review during PR. Hosted manifest at MANIFEST_URL
// overrides these without requiring a release.
const BAKED_IN: DefaultsManifest = {
  version: 1,
  defaults: {
    "text-to-image": "fal-ai/flux/schnell",
    "text-to-video": "fal-ai/minimax/hailuo-02/standard/text-to-video",
    "text-to-audio-music": "fal-ai/cassetteai/cassette",
    "text-to-audio-tts": "fal-ai/elevenlabs/tts/multilingual-v2",
    "text-to-3d": "fal-ai/triposr",
  },
};

function isFreshCache(fetchedAt: number, now: number): boolean {
  return now - fetchedAt < TTL_MS;
}

export function isValidManifest(input: unknown): input is DefaultsManifest {
  if (!input || typeof input !== "object") return false;
  const m = input as Partial<DefaultsManifest>;
  if (m.version !== 1) return false;
  if (!m.defaults || typeof m.defaults !== "object") return false;
  return true;
}

// Pure function: given current cache state and a fetched manifest (or null),
// decide which endpoint to return and whether to update the cache. Exposed for
// unit testing the fallback logic without touching disk or network.
export function decideResolution(input: {
  modality: Modality;
  cached: DefaultsManifestCacheEntry | undefined;
  fetched: DefaultsManifest | null;
  now: number;
}): {
  result: ResolvedDefault;
  saveCache?: DefaultsManifestCacheEntry;
} {
  const { modality, cached, fetched, now } = input;

  if (cached && isFreshCache(cached.fetchedAt, now)) {
    const endpoint = cached.manifest.defaults[modality];
    if (endpoint) {
      return { result: { endpoint_id: endpoint, source: "cached" } };
    }
  }

  if (fetched) {
    const endpoint = fetched.defaults[modality];
    if (endpoint) {
      return {
        result: { endpoint_id: endpoint, source: "manifest" },
        saveCache: { fetchedAt: now, manifest: fetched },
      };
    }
  }

  // Stale cache as a last-resort before baked-in (preserves the user's most
  // recent server-side override even when the network is offline).
  if (cached) {
    const endpoint = cached.manifest.defaults[modality];
    if (endpoint) {
      return { result: { endpoint_id: endpoint, source: "cached" } };
    }
  }

  return {
    result: {
      endpoint_id: BAKED_IN.defaults[modality],
      source: "baked-in",
    },
  };
}

async function fetchManifest(): Promise<DefaultsManifest | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MANIFEST_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "genmedia-cli" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return isValidManifest(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveDefaultEndpoint(
  modality: Modality,
): Promise<ResolvedDefault> {
  const cfg = loadConfig();
  const cached = cfg.defaultsManifestCache;
  const now = Date.now();

  // Skip fetch if cache is still fresh.
  let fetched: DefaultsManifest | null = null;
  if (!cached || !isFreshCache(cached.fetchedAt, now)) {
    fetched = await fetchManifest();
  }

  const { result, saveCache } = decideResolution({
    modality,
    cached,
    fetched,
    now,
  });

  if (saveCache) {
    saveConfig({ ...cfg, defaultsManifestCache: saveCache });
  }

  return result;
}

// Exported for tests / external introspection.
export { BAKED_IN, FETCH_TIMEOUT_MS, MANIFEST_URL, TTL_MS };
