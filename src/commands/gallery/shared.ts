import { spawn } from "node:child_process";
import {
  type GalleryPaths,
  galleryPaths,
  readLastSession,
  resolveLatestSessionId,
  rootIndexPath,
  rootIndexUrl,
} from "../../lib/gallery";
import { getSessionContext, type SessionContext } from "../../lib/session";

// Cross-platform `open <url>` — zero deps. Detached + stdio:ignore so the
// process doesn't block the CLI on exit.
export function openInBrowser(url: string): boolean {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export type ResolvedTargetKind = "session" | "index";

export interface ResolvedSessionTarget {
  kind: "session";
  // "current" = the session this CLI invocation resolves to via session.ts.
  // "latest" = the last-recorded session pointer / sessions/ scan.
  // "explicit" = a session id passed directly on the command line.
  source: "current" | "latest" | "explicit";
  session_id: string;
  paths: GalleryPaths;
}

export interface ResolvedIndexTarget {
  kind: "index";
  source: "index";
  path: string;
  url: string;
}

export type ResolvedTarget = ResolvedSessionTarget | ResolvedIndexTarget;

export interface TargetResolveError {
  kind: "error";
  reason: "latest-empty";
  message: string;
}

// Resolves the user-provided target ("current" | "latest" | "index" | <id>)
// to a concrete path bundle. Returns a `kind: "error"` shape for cases that
// must be surfaced to the user (e.g. `latest` requested but no session has
// ever been recorded).
export function resolveTarget(
  rawTarget: string | undefined,
  ctx: SessionContext = getSessionContext(),
): ResolvedTarget | TargetResolveError {
  const target = (rawTarget ?? "current").trim();

  if (target === "index") {
    return {
      kind: "index",
      source: "index",
      path: rootIndexPath(),
      url: rootIndexUrl(),
    };
  }

  if (target === "current" || target === "") {
    return {
      kind: "session",
      source: "current",
      session_id: ctx.id,
      paths: galleryPaths(ctx.id),
    };
  }

  if (target === "latest") {
    const id = resolveLatestSessionId();
    if (!id) {
      return {
        kind: "error",
        reason: "latest-empty",
        message:
          "No recorded sessions yet — run `genmedia run` to generate something first.",
      };
    }
    return {
      kind: "session",
      source: "latest",
      session_id: id,
      paths: galleryPaths(id),
    };
  }

  // Anything else is treated as an explicit session id. We don't validate
  // the id exists here — callers report `exists: false` so an agent can
  // distinguish "typo" from "empty".
  return {
    kind: "session",
    source: "explicit",
    session_id: target,
    paths: galleryPaths(target),
  };
}

export function lastSessionMeta(): {
  session_id: string;
  agent: string | null;
  updated_at: number;
} | null {
  const last = readLastSession();
  if (!last) return null;
  return {
    session_id: last.session_id,
    agent: last.agent,
    updated_at: last.updated_at,
  };
}
