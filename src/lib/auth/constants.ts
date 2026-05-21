// Auth0 device-authorization grant configuration. genmedia-cli rides fal.ai's
// per-tool auth namespace at /api/auth/tool/<TOOL_SLUG>/{session-seed,callback}
// with its own Auth0 application — distinct from other tools (fal-cli, MCP)
// that share the same infrastructure.

// Identifier used as the path segment under /api/auth/tool/ on the webapp.
// The webapp resolves the corresponding Auth0 client_id from
// `AUTH0_CLIENT_ID_GENMEDIA`. Hardcoded — not user-configurable.
export const TOOL_SLUG = "genmedia";

const DEFAULT_AUTH_DOMAIN = "https://auth.fal.ai";
// Placeholder — replace with the genmedia-cli Auth0 application client_id
// before shipping. Users running a development build can override via
// FAL_AUTH_CLIENT_ID.
const DEFAULT_CLIENT_ID = "REPLACE_ME_GENMEDIA_AUTH0_CLIENT_ID";
const DEFAULT_AUDIENCE = "fal.ai/api";
const DEFAULT_BASE_URL = "https://fal.ai";

// Build-time flag: replaced with the literal `true` by `bun build --define
// __PROD_BUILD__=true ...` (see package.json `build` script). When running
// from source via `bun run dev`, the identifier is undefined at runtime and
// `typeof` narrows it to "undefined" without throwing — the auth endpoint /
// base URL / client_id env-var overrides are honored, which is what we want
// for local development. In the shipped binary the flag is true and the
// overrides are ignored, so an attacker can't redirect a user's auth flow
// to a malicious host by setting environment variables.
declare const __PROD_BUILD__: boolean;
const isProductionBuild =
  typeof __PROD_BUILD__ !== "undefined" && __PROD_BUILD__ === true;

function readOverride(envVar: string): string | undefined {
  if (isProductionBuild) return undefined;
  const value = process.env[envVar];
  return value && value.length > 0 ? value : undefined;
}

export function getAuthDomain(): string {
  return (readOverride("FAL_AUTH_DOMAIN") ?? DEFAULT_AUTH_DOMAIN).replace(
    /\/+$/,
    "",
  );
}

export function getClientId(): string {
  return readOverride("FAL_AUTH_CLIENT_ID") ?? DEFAULT_CLIENT_ID;
}

export function getAudience(): string {
  return readOverride("FAL_AUTH_AUDIENCE") ?? DEFAULT_AUDIENCE;
}

// Webapp base URL — used to build the session-seed redirect that
// pre-establishes an Auth0 session before showing the activation page.
// Locked to https://fal.ai in production builds; configurable via
// FAL_BASE_URL when running from source for local webapp testing.
export function getWebappBaseUrl(): string {
  return (readOverride("FAL_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function getDeviceCodeUrl(): string {
  return `${getAuthDomain()}/oauth/device/code`;
}

export function getTokenUrl(): string {
  return `${getAuthDomain()}/oauth/token`;
}

export function getRevokeUrl(): string {
  return `${getAuthDomain()}/oauth/revoke`;
}

export function getUserInfoUrl(): string {
  return `${getAuthDomain()}/userinfo`;
}

export function getSessionSeedUrl(): string {
  return `${getWebappBaseUrl()}/api/auth/tool/${TOOL_SLUG}/session-seed`;
}

// FAL_AUTH_DEBUG is intentionally honored in both dev and production builds —
// it only toggles stderr logging, not endpoint targets, so it can't be abused
// to redirect the auth flow.
export function isAuthDebug(): boolean {
  return process.env.FAL_AUTH_DEBUG === "1";
}

// True when running from source (e.g. `bun run dev`) — useful for surfacing
// the dev-only override capability in --help output.
export function isDevelopmentBuild(): boolean {
  return !isProductionBuild;
}

export const REFRESH_LEEWAY_MS = 60 * 1000;
// `openid offline_access` ensures Auth0 returns a refresh token in addition
// to the access token, plus a profile scope for /userinfo.
export const DEFAULT_SCOPES = "openid profile email offline_access";
