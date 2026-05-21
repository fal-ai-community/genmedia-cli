import { defineCommand } from "citty";
import { revokeRefreshToken } from "../../lib/auth/device";
import { clearSession, getSession } from "../../lib/auth/session";
import { isJsonOutput, output } from "../../lib/output";
import { colors, symbols } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "logout",
    description: "Clear the local fal.ai session",
  },
  args: {
    revoke: {
      type: "boolean",
      description:
        "Also revoke the refresh token server-side (best-effort network call)",
    },
  },
  async run({ args }) {
    const session = getSession();
    if (!session) {
      if (isJsonOutput()) {
        output({ ok: true, signed_in: false });
        return;
      }
      process.stdout.write(`${symbols.info} No active session to clear.\n`);
      return;
    }

    if (args.revoke) {
      await revokeRefreshToken(session.refresh_token);
    }
    clearSession();

    if (isJsonOutput()) {
      output({ ok: true, signed_in: false, revoked: Boolean(args.revoke) });
      return;
    }

    process.stdout.write(`${colors.green(symbols.success)} Signed out.\n`);
  },
});
