import { getOrCreateInstallationId, loadConfig } from "./config";
import { getOutputMode } from "./output";
import { VERSION } from "./version";

// Replaced at build time by `bun build --define __POSTHOG_KEY__='"phc_xxx"'`.
// Empty string (or undefined in `bun run dev`) disables analytics entirely.
declare const __POSTHOG_KEY__: string | undefined;

const POSTHOG_HOST = "https://us.i.posthog.com";

type PostHogClient = {
  capture: (args: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }) => void;
  shutdown: () => Promise<void>;
};

let _enabled = false;
let _client: PostHogClient | null = null;
let _distinctId: string | null = null;
let _superProps: Record<string, unknown> = {};
let _initPromise: Promise<void> | null = null;
let _firstRun = false;

function resolveKey(): string {
  const buildTimeKey =
    typeof __POSTHOG_KEY__ !== "undefined" ? __POSTHOG_KEY__ : undefined;
  return (buildTimeKey ?? process.env.POSTHOG_KEY ?? "").trim();
}

function isOptedOut(): boolean {
  if (process.env.GENMEDIA_NO_ANALYTICS === "1") return true;
  if (loadConfig().analyticsOptOut === true) return true;
  return false;
}

export function initAnalytics(): void {
  if (_initPromise) return;
  _initPromise = (async () => {
    try {
      const key = resolveKey();
      if (!key || isOptedOut()) return;

      const cfg = loadConfig();
      _firstRun = !cfg.installationId;
      _distinctId = getOrCreateInstallationId();

      const { PostHog } = await import("posthog-node");
      _client = new PostHog(key, {
        host: POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
      }) as unknown as PostHogClient;

      _superProps = {
        version: VERSION,
        platform: process.platform,
        arch: process.arch,
        runtime: process.versions.bun
          ? `bun-${process.versions.bun}`
          : `node-${process.version}`,
        outputMode: getOutputMode(),
      };

      _enabled = true;

      if (_firstRun) {
        track("cli_first_run");
      }
    } catch {
      // Analytics must never break the CLI.
    }
  })();
}

export function track(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!_enabled || !_client || !_distinctId) return;
  try {
    _client.capture({
      distinctId: _distinctId,
      event,
      properties: { ..._superProps, ...properties },
    });
  } catch {
    // Swallow — analytics must never throw.
  }
}

export async function shutdownAnalytics(): Promise<void> {
  if (!_initPromise) return;
  try {
    await _initPromise;
  } catch {
    return;
  }
  if (!_enabled || !_client) return;

  try {
    await Promise.race([
      _client.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
  } catch {
    // ignore
  } finally {
    _enabled = false;
    _client = null;
  }
}
