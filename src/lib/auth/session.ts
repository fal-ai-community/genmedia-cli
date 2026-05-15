import { closeSync, existsSync, openSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  type AuthSession,
  CONFIG_DIR,
  type GenmediaConfig,
  invalidateConfigCache,
  loadConfig,
  saveConfig,
} from "../config";
import { isAuthDebug, REFRESH_LEEWAY_MS } from "./constants";
import { RefreshFailedError, refreshTokens } from "./device";

export type { AuthSession } from "../config";

const LOCK_FILE = join(CONFIG_DIR, "auth.lock");
// Total time we wait for another process's lock before treating the situation
// as pathological. Longer than any legitimate refresh round-trip — the only
// reason to wait this long is if the other process is genuinely doing work.
const LOCK_WAIT_MS = 30_000;
// A lock file older than this is almost certainly orphaned by a crashed
// process. Legitimate holders complete in seconds; STALE_LOCK_MS leaves a
// generous margin for slow networks, paused VMs, etc.
const STALE_LOCK_MS = 30_000;
const LOCK_POLL_MS = 100;

function debug(msg: string): void {
  if (isAuthDebug()) process.stderr.write(`[auth] ${msg}\n`);
}

export function getSession(): AuthSession | undefined {
  return loadConfig().session;
}

export function setSession(session: AuthSession): void {
  const cfg = loadConfig();
  saveConfig({ ...cfg, session });
}

export function clearSession(): void {
  const cfg = loadConfig();
  const next: GenmediaConfig = { ...cfg };
  delete next.session;
  saveConfig(next);
}

export function decodeJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const padLen = (4 - (parts[1].length % 4)) % 4;
    const padded = parts[1] + "=".repeat(padLen);
    const json = Buffer.from(
      padded.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");
    const claims = JSON.parse(json) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function computeExpiresAt(opts: {
  accessToken: string;
  expiresIn?: number;
}): number {
  const now = Date.now();
  if (typeof opts.expiresIn === "number") return now + opts.expiresIn * 1000;
  const fromJwt = decodeJwtExp(opts.accessToken);
  if (fromJwt) return fromJwt;
  return now + 60 * 60 * 1000; // 1 hour default
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd: number | null = null;

  while (Date.now() < deadline) {
    try {
      fd = openSync(LOCK_FILE, "wx");
      break;
    } catch {
      // Lock exists — check if it's stale (mtime older than threshold).
      try {
        const { mtimeMs } = statSync(LOCK_FILE);
        if (Date.now() - mtimeMs > STALE_LOCK_MS) {
          debug("removing stale auth lock");
          try {
            unlinkSync(LOCK_FILE);
          } catch {
            // Raced with another reclaimer — fall through and retry the open.
          }
          continue;
        }
      } catch {
        // Lock file vanished (likely released) between the failed open and the stat — retry the open.
        continue;
      }
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
    }
  }

  if (fd === null) {
    throw new RefreshFailedError(
      "Could not acquire auth lock — another genmedia process appears hung. Retry shortly."
    );
  }

  try {
    return await fn();
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* noop */
    }
    try {
      if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
    } catch {
      /* noop */
    }
  }
}

let inFlightRefresh: Promise<string | null> | null = null;

export async function getValidAccessToken(opts?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const session = getSession();
  if (!session) return null;

  const force = opts?.forceRefresh === true;
  if (!force && session.expires_at - Date.now() > REFRESH_LEEWAY_MS) {
    return session.access_token;
  }

  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      return await withLock(async () => {
        invalidateConfigCache();
        const fresh = getSession();
        if (!fresh) return null;
        if (!force && fresh.expires_at - Date.now() > REFRESH_LEEWAY_MS) {
          return fresh.access_token;
        }

        try {
          const res = await refreshTokens(fresh.refresh_token);
          const next: AuthSession = {
            access_token: res.access_token,
            // Auth0 may rotate the refresh token; fall back to the existing one.
            refresh_token: res.refresh_token ?? fresh.refresh_token,
            expires_at: computeExpiresAt({
              accessToken: res.access_token,
              expiresIn: res.expires_in,
            }),
            obtained_at: Date.now(),
            user: fresh.user,
          };
          setSession(next);
          debug("refreshed access token");
          return next.access_token;
        } catch (e) {
          if (e instanceof RefreshFailedError) {
            debug(`refresh failed: ${e.message}`);
            clearSession();
            return null;
          }
          throw e;
        }
      });
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
