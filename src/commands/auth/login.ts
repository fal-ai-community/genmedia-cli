import { defineCommand } from "citty";
import { displayName, runLoginFlow } from "../../lib/auth/flow";
import { clearSession, getSession } from "../../lib/auth/session";
import { error, isJsonOutput, output } from "../../lib/output";
import { colors, hasInteractiveTerminal, symbols } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "login",
    description:
      "Sign in to fal.ai by opening your browser (Auth0 device-code flow)",
  },
  args: {
    force: {
      type: "boolean",
      description: "Re-authenticate even if a valid session already exists",
    },
    connection: {
      type: "string",
      description:
        "Skip the provider picker: identity provider name (e.g. google, github)",
    },
  },
  async run({ args }) {
    if (!hasInteractiveTerminal()) {
      error("`genmedia auth login` requires an interactive terminal.", {
        hint: "Run it locally, then copy ~/.genmedia/config.json across machines, or use FAL_KEY in non-interactive environments.",
      });
    }

    const force = Boolean(args.force);
    const existing = getSession();
    if (existing && !force && existing.expires_at - Date.now() > 60_000) {
      const name = displayName(existing.user);
      if (isJsonOutput()) {
        output({
          ok: true,
          already_signed_in: true,
          user: existing.user,
          expires_at: existing.expires_at,
        });
        return;
      }
      process.stdout.write(
        `${colors.green(symbols.success)} Already signed in as ${colors.bold(name)}.\n`,
      );
      process.stdout.write(
        `${colors.dim("Pass --force to re-authenticate.")}\n`,
      );
      return;
    }

    if (force && existing) clearSession();

    const connection =
      typeof args.connection === "string" && args.connection.length > 0
        ? args.connection
        : undefined;

    const { session } = await runLoginFlow({
      quiet: isJsonOutput(),
      connection,
    });

    if (isJsonOutput()) {
      output({
        ok: true,
        user: session.user,
        expires_at: session.expires_at,
        expires_in_seconds: Math.max(
          0,
          Math.floor((session.expires_at - Date.now()) / 1000),
        ),
      });
      return;
    }

    process.stdout.write(
      `${colors.dim("Session stored in ~/.genmedia/config.json.")}\n`,
    );
  },
});
