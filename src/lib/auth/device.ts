import {
  DEFAULT_SCOPES,
  getAudience,
  getClientId,
  getDeviceCodeUrl,
  getRevokeUrl,
  getTokenUrl,
  getUserInfoUrl,
  isAuthDebug,
} from "./constants";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface UserInfoResponse {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export class DeviceFlowError extends Error {
  constructor(
    public readonly code:
      | "access_denied"
      | "expired_token"
      | "invalid_request"
      | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "DeviceFlowError";
  }
}

export class RefreshFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefreshFailedError";
  }
}

function debug(msg: string): void {
  if (isAuthDebug()) process.stderr.write(`[auth] ${msg}\n`);
}

async function postForm<T>(
  url: string,
  body: Record<string, string>,
): Promise<{
  ok: boolean;
  status: number;
  data: T | { error?: string; error_description?: string };
}> {
  debug(`POST ${url} grant=${body.grant_type ?? "(none)"}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: "invalid_response", error_description: text };
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const result = await postForm<DeviceCodeResponse>(getDeviceCodeUrl(), {
    client_id: getClientId(),
    scope: DEFAULT_SCOPES,
    audience: getAudience(),
  });
  if (!result.ok) {
    const data = result.data as { error?: string; error_description?: string };
    throw new Error(
      `Device authorization request failed (${result.status}): ${
        data.error_description ?? data.error ?? "unknown"
      }`,
    );
  }
  return result.data as DeviceCodeResponse;
}

// Polls Auth0's token endpoint until the user completes the activation step,
// the device code expires, or the user denies. Honors `slow_down` by
// extending the poll interval.
export async function pollForToken(opts: {
  deviceCode: string;
  interval: number;
  expiresIn: number;
  signal?: AbortSignal;
  onTick?: () => void;
}): Promise<TokenResponse> {
  let interval = Math.max(1, opts.interval) * 1000;
  const deadline = Date.now() + opts.expiresIn * 1000;

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) {
      throw new DeviceFlowError("invalid_request", "Sign-in cancelled.");
    }
    await sleep(interval, opts.signal);
    opts.onTick?.();

    const result = await postForm<TokenResponse>(getTokenUrl(), {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: opts.deviceCode,
      client_id: getClientId(),
    });

    if (result.ok) return result.data as TokenResponse;

    const err = result.data as { error?: string; error_description?: string };
    switch (err.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval += 5000;
        continue;
      case "expired_token":
        throw new DeviceFlowError(
          "expired_token",
          "The sign-in code expired. Run `genmedia auth login` again.",
        );
      case "access_denied":
        throw new DeviceFlowError(
          "access_denied",
          "Sign-in was denied in the browser.",
        );
      default:
        throw new DeviceFlowError(
          "unknown",
          err.error_description ?? err.error ?? "Token poll failed.",
        );
    }
  }
  throw new DeviceFlowError(
    "expired_token",
    "Sign-in timed out. Run `genmedia auth login` again.",
  );
}

export async function refreshTokens(
  refreshToken: string,
): Promise<TokenResponse> {
  const result = await postForm<TokenResponse>(getTokenUrl(), {
    grant_type: "refresh_token",
    client_id: getClientId(),
    refresh_token: refreshToken,
  });
  if (!result.ok) {
    const err = result.data as { error?: string; error_description?: string };
    throw new RefreshFailedError(
      `Refresh failed (${result.status}): ${
        err.error_description ?? err.error ?? "unknown"
      }`,
    );
  }
  return result.data as TokenResponse;
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<UserInfoResponse> {
  const res = await fetch(getUserInfoUrl(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`User info request failed: ${res.status}`);
  }
  return (await res.json()) as UserInfoResponse;
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await postForm<unknown>(getRevokeUrl(), {
      client_id: getClientId(),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
  } catch {
    // Best-effort — local clear is what really matters.
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}
