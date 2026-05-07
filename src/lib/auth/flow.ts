import type { AuthSession } from "../config";
import { colors, createSpinner, symbols } from "../ui";
import { openBrowser } from "./browser";
import { getSessionSeedUrl } from "./constants";
import {
  type DeviceCodeResponse,
  fetchUserInfo,
  pollForToken,
  startDeviceFlow,
} from "./device";
import { computeExpiresAt, setSession } from "./session";

export interface LoginFlowResult {
  session: AuthSession;
}

// Runs the full Auth0 device-authorization flow:
//   1. Request a device + user code from Auth0.
//   2. Optionally hop the browser through fal.ai's session-seed endpoint to
//      auto-confirm if the user already has an Auth0 session.
//   3. Poll the token endpoint until the user completes activation.
//   4. Fetch userinfo and persist the session.
export async function runLoginFlow(opts?: {
  // Auth0 connection name to seed (e.g. "google", "github"). When unset, the
  // browser opens auth.fal.ai's activation page directly and the user picks
  // a provider there.
  connection?: string;
  // Suppresses pretty TTY output. Used in --json mode.
  quiet?: boolean;
}): Promise<LoginFlowResult> {
  const quiet = opts?.quiet === true;

  const device = await startDeviceFlow();
  const browserUrl = buildBrowserUrl({
    device,
    connection: opts?.connection,
  });

  if (!quiet) {
    process.stdout.write("\n");
    process.stdout.write(
      `${colors.bold("Verification code:")} ${colors.cyan(device.user_code)}\n`,
    );
    process.stdout.write(
      `${colors.dim("Confirm this code matches what you see in the browser.")}\n\n`,
    );
    process.stdout.write(`${colors.bold("Open this URL in your browser:")}\n`);
    process.stdout.write(`  ${colors.cyan(browserUrl)}\n\n`);
    process.stdout.write(
      `${colors.dim("If your browser doesn't open automatically, copy the URL above.")}\n\n`,
    );
  }

  openBrowser(browserUrl);

  const spinner = quiet ? null : createSpinner("Waiting for browser sign-in…");
  spinner?.start();

  let tokens: Awaited<ReturnType<typeof pollForToken>>;
  try {
    tokens = await pollForToken({
      deviceCode: device.device_code,
      interval: device.interval,
      expiresIn: device.expires_in,
    });
  } catch (e) {
    spinner?.fail("Sign-in failed");
    throw e;
  }

  spinner?.update("Fetching user info…");

  let userInfo: Awaited<ReturnType<typeof fetchUserInfo>>;
  try {
    userInfo = await fetchUserInfo(tokens.access_token);
  } catch (e) {
    spinner?.fail("Sign-in failed");
    throw e;
  }

  if (!tokens.refresh_token) {
    spinner?.fail("Sign-in failed");
    throw new Error(
      "Auth0 did not return a refresh token. Confirm the application has refresh tokens + offline_access enabled.",
    );
  }

  const session: AuthSession = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: computeExpiresAt({
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    }),
    obtained_at: Date.now(),
    user: {
      id: userInfo.sub,
      email: userInfo.email ?? "",
      first_name: userInfo.given_name,
      last_name: userInfo.family_name,
    },
  };
  setSession(session);

  if (spinner) {
    spinner.succeed(
      `${colors.green(symbols.success)} Signed in as ${colors.bold(displayName(session.user))}`,
    );
  }

  return { session };
}

function buildBrowserUrl(opts: {
  device: DeviceCodeResponse;
  connection?: string;
}): string {
  if (!opts.connection) {
    return opts.device.verification_uri_complete;
  }
  // Hop through the webapp's per-tool session-seed endpoint so a returning
  // user can auto-confirm without re-picking their identity provider. The
  // tool's Auth0 client_id is resolved server-side from the URL path.
  const url = new URL(getSessionSeedUrl());
  url.searchParams.set("user_code", opts.device.user_code);
  url.searchParams.set(
    "verification_uri_complete",
    opts.device.verification_uri_complete,
  );
  url.searchParams.set("connection", opts.connection);
  return url.toString();
}

export function displayName(user: AuthSession["user"]): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return full.length > 0 ? `${full} <${user.email}>` : user.email;
}
