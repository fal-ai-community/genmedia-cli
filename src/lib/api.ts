import { fal } from "@fal-ai/client";
import { getSession, getValidAccessToken } from "./auth/session";
import { loadConfig } from "./config";
import { error } from "./output";

export const PLATFORM_BASE = "https://api.fal.ai/v1";

export type AuthMode = "key" | "bearer";

export interface ResolvedAuth {
  mode: AuthMode;
  value: string;
  source: "env" | "session" | "config";
}

// Resolution precedence: FAL_KEY env > valid WorkOS session > saved API key.
// Env always wins so CI / operator overrides remain unambiguous.
export async function resolveAuth(): Promise<ResolvedAuth | null> {
  if (process.env.FAL_KEY) {
    return { mode: "key", value: process.env.FAL_KEY, source: "env" };
  }
  if (getSession()) {
    const token = await getValidAccessToken();
    if (token) return { mode: "bearer", value: token, source: "session" };
  }
  const apiKey = loadConfig().apiKey;
  if (apiKey) return { mode: "key", value: apiKey, source: "config" };
  return null;
}

function noAuthError(): never {
  error("Not authenticated.", {
    hint: [
      "Run `genmedia auth login` to sign in with your fal.ai account, or",
      "set FAL_KEY in your environment, or",
      "run `genmedia setup` to configure an API key.",
    ].join("\n"),
  });
}

async function requireAuth(): Promise<ResolvedAuth> {
  const a = await resolveAuth();
  if (!a) noAuthError();
  return a;
}

export async function platformHeaders(): Promise<Record<string, string>> {
  const a = await requireAuth();
  return {
    Authorization: a.mode === "bearer" ? `Bearer ${a.value}` : `Key ${a.value}`,
    "Content-Type": "application/json",
  };
}

// fetch wrapper that retries once on 401 with a forced session refresh.
// Use for REST calls so a session that expired between resolveAuth() and the
// HTTP round-trip is repaired transparently.
export async function platformFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const a = await requireAuth();
  const headers = mergeHeaders(init.headers, authHeader(a));
  const res = await fetch(url, { ...init, headers });

  if (res.status !== 401 || a.source !== "session") return res;

  const fresh = await getValidAccessToken({ forceRefresh: true });
  if (!fresh) return res;
  const retryHeaders = mergeHeaders(init.headers, {
    Authorization: `Bearer ${fresh}`,
    "Content-Type": "application/json",
  });
  return fetch(url, { ...init, headers: retryHeaders });
}

function authHeader(a: ResolvedAuth): Record<string, string> {
  return {
    Authorization: a.mode === "bearer" ? `Bearer ${a.value}` : `Key ${a.value}`,
    "Content-Type": "application/json",
  };
}

function mergeHeaders(
  base: HeadersInit | undefined,
  overrides: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (base) {
    if (base instanceof Headers) {
      base.forEach((v, k) => {
        out[k] = v;
      });
    } else if (Array.isArray(base)) {
      for (const [k, v] of base) out[k] = v;
    } else {
      Object.assign(out, base);
    }
  }
  Object.assign(out, overrides);
  return out;
}

// Configures the @fal-ai/client SDK so that every dispatched request inherits
// the current auth state. The SDK hardcodes `Authorization: Key <credentials>`,
// so we install a `requestMiddleware` that adds the correct header. The SDK
// merges middleware headers AFTER its own auth header (Object.assign order in
// node_modules/@fal-ai/client/src/request.js), so middleware values win.
export function configureSDK(): void {
  fal.config({
    // Provide an empty credential by default — the middleware sets the real
    // header per-request. If the resolver throws (no auth), the SDK will
    // dispatch with no Authorization and fal.ai will reject with 401.
    credentials: () => undefined,
    requestMiddleware: async (req) => {
      const a = await resolveAuth();
      if (!a) return req;
      return {
        ...req,
        headers: {
          ...(req.headers ?? {}),
          Authorization:
            a.mode === "bearer" ? `Bearer ${a.value}` : `Key ${a.value}`,
        },
      };
    },
  });
}
