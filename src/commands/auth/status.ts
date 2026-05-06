import { defineCommand } from "citty";
import { fetchUserInfo } from "../../lib/auth/device";
import { displayName } from "../../lib/auth/flow";
import { getSession } from "../../lib/auth/session";
import { loadConfig } from "../../lib/config";
import { isJsonOutput, output } from "../../lib/output";
import { colors, maskSecret, symbols } from "../../lib/ui";

function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `in ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

export default defineCommand({
  meta: {
    name: "status",
    description: "Show how the CLI is currently authenticated",
  },
  args: {
    verify: {
      type: "boolean",
      description: "Verify the session by hitting the WorkOS userinfo endpoint",
    },
  },
  async run({ args }) {
    const session = getSession();
    const apiKey = loadConfig().apiKey;
    const envKey = process.env.FAL_KEY;

    let signedIn = false;
    let source: "session" | "env" | "api_key" | "none" = "none";
    let user = session?.user;
    let verifyError: string | undefined;

    if (envKey) {
      source = "env";
    } else if (session) {
      signedIn = true;
      source = "session";
      if (args.verify) {
        try {
          const info = await fetchUserInfo(session.access_token);
          user = {
            id: info.sub,
            email: info.email ?? user?.email ?? "",
            first_name: info.given_name ?? user?.first_name,
            last_name: info.family_name ?? user?.last_name,
          };
        } catch (e) {
          verifyError = e instanceof Error ? e.message : String(e);
        }
      }
    } else if (apiKey) {
      source = "api_key";
    }

    if (isJsonOutput()) {
      output({
        ok: true,
        signed_in: signedIn,
        source,
        ...(user ? { user } : {}),
        ...(session
          ? {
              expires_at: session.expires_at,
              expires_in_seconds: Math.max(
                0,
                Math.floor((session.expires_at - Date.now()) / 1000),
              ),
            }
          : {}),
        ...(envKey ? { fal_key_env: maskSecret(envKey) } : {}),
        ...(apiKey && !signedIn ? { api_key: maskSecret(apiKey) } : {}),
        ...(verifyError ? { verify_error: verifyError } : {}),
      });
      return;
    }

    if (signedIn && session && user) {
      process.stdout.write(
        `${colors.green(symbols.success)} Signed in as ${colors.bold(displayName(user))}\n`,
      );
      process.stdout.write(`  ${colors.dim("Auth source:")} WorkOS session\n`);
      process.stdout.write(
        `  ${colors.dim("Expires:")}     ${formatDuration(session.expires_at - Date.now())}\n`,
      );
      if (verifyError) {
        process.stdout.write(
          `${colors.red(symbols.warning)} Verify failed: ${verifyError}\n`,
        );
      }
      return;
    }

    if (source === "env") {
      process.stdout.write(
        `${symbols.info} Using FAL_KEY from environment (${maskSecret(envKey ?? "")}).\n`,
      );
      return;
    }
    if (source === "api_key") {
      process.stdout.write(
        `${symbols.info} Using saved API key (${maskSecret(apiKey ?? "")}).\n`,
      );
      process.stdout.write(
        `  ${colors.dim("Run `genmedia auth login` to switch to your fal.ai account.")}\n`,
      );
      return;
    }

    process.stdout.write(`${symbols.warning} Not signed in.\n`);
    process.stdout.write(
      `  Run ${colors.bold("genmedia auth login")} to sign in with your fal.ai account.\n`,
    );
  },
});
