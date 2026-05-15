import { defineCommand } from "citty";
import {
  listSessions,
  regenerateRootIndexHtml,
  rootIndexUrl,
} from "../../lib/gallery";
import { error, isJsonOutput, output } from "../../lib/output";
import { colors } from "../../lib/ui";

export const DEFAULT_LIMIT = 50;

export function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

export default defineCommand({
  meta: {
    name: "list",
    description: "List recorded gallery sessions (newest first)",
  },
  args: {
    limit: {
      type: "string",
      description: `Max sessions to return (default: ${DEFAULT_LIMIT})`,
    },
  },
  async run({ args }) {
    // The URL we print at the end points at on-disk HTML — refresh it so
    // a user clicking through gets the current CLI's template.
    regenerateRootIndexHtml();

    const limit = parseLimit(args.limit);
    if (limit === null) {
      error(`Invalid --limit value: ${args.limit}`, {
        hint: "Pass a positive integer (e.g. --limit 20).",
      });
    }
    const sessions = listSessions().slice(0, limit);

    if (isJsonOutput()) {
      output(
        {
          scope: "list",
          sessions,
          count: sessions.length,
          index_url: rootIndexUrl(),
        },
        { view: "default" },
      );
      return;
    }

    if (sessions.length === 0) {
      process.stdout.write(
        `${colors.dim("No sessions yet. Run `genmedia run` to generate something.")}\n`,
      );
      return;
    }
    for (const s of sessions) {
      const meta = [s.agent, s.agent_host]
        .filter((v): v is string => Boolean(v))
        .join(" · ");
      process.stdout.write(
        `${colors.bold(s.session_id)}  ${colors.dim(meta || "unknown agent")}  ` +
          `${s.asset_count} asset${s.asset_count === 1 ? "" : "s"} / ${s.run_count} run${s.run_count === 1 ? "" : "s"}  ` +
          `${colors.dim(new Date(s.updated_at).toLocaleString())}\n`,
      );
    }
    process.stdout.write(`\n${colors.dim(`Index: ${rootIndexUrl()}`)}\n`);
  },
});
