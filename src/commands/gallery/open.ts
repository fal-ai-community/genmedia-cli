import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import {
  regenerateRootIndexHtml,
  regenerateSessionHtml,
} from "../../lib/gallery";
import { error, isPrettyOutput, output } from "../../lib/output";
import { colors, symbols } from "../../lib/ui";
import { openInBrowser, resolveTarget } from "./shared";

export default defineCommand({
  meta: {
    name: "open",
    description:
      "Open the all-sessions index (default) or a specific session in the default browser",
  },
  args: {
    target: {
      type: "positional",
      required: false,
      description:
        'Target: omit for the all-sessions index, or pass "current", "latest", or a specific <session_id>',
    },
    print: {
      type: "boolean",
      description:
        "Resolve target and print path/url only — do not spawn the browser",
    },
  },
  async run({ args }) {
    // No-arg default is the all-sessions index — always has something useful
    // to show (or an empty state) and lets users navigate from there. The
    // "index" keyword still resolves to the same target for explicit callers.
    const resolved = resolveTarget(args.target ?? "index");
    if (resolved.kind === "error") {
      error(resolved.message, {
        hint: "Use `genmedia gallery list` to see recorded sessions.",
      });
    }

    if (resolved.kind === "index") {
      // Re-render with the current CLI's template/version before handing over
      // the URL — protects against stale HTML left behind by an older CLI.
      regenerateRootIndexHtml();
      const exists = existsSync(resolved.path);
      const opened =
        !args.print && exists ? openInBrowser(resolved.url) : false;

      if (!exists && !args.print && isPrettyOutput()) {
        process.stderr.write(
          `${colors.yellow(symbols.warning)} No sessions recorded yet — nothing to open.\n`,
        );
      }
      output(
        {
          scope: "open",
          target: "index",
          path: resolved.path,
          url: resolved.url,
          exists,
          opened,
          ...(exists
            ? {}
            : {
                hint: "Run `genmedia run` to generate something first.",
              }),
        },
        { view: "default" },
      );
      return;
    }

    const { paths, session_id, source } = resolved;
    // Best-effort: refresh the target's HTML against the current bundled
    // template before existsSync / opening. No-op for sessions without a
    // data.json (e.g. a freshly-resolved "current" with nothing recorded).
    regenerateSessionHtml(session_id);
    const exists = existsSync(paths.index_path);
    const opened =
      !args.print && exists ? openInBrowser(paths.index_url) : false;

    if (!exists && !args.print && isPrettyOutput()) {
      const hint =
        source === "current"
          ? "Try `genmedia gallery open latest` to reattach to your most-recent session."
          : "Use `genmedia gallery list` to find a valid session id.";
      process.stderr.write(
        `${colors.yellow(symbols.warning)} No gallery to open for this session yet.\n  ${colors.dim(hint)}\n`,
      );
    }

    output(
      {
        scope: "open",
        target: source,
        session_id,
        path: paths.index_path,
        url: paths.index_url,
        exists,
        opened,
        ...(exists
          ? {}
          : {
              hint:
                source === "current"
                  ? "Run a model first, or use `genmedia gallery open latest`."
                  : "Session id has no recorded data. Use `genmedia gallery list`.",
            }),
      },
      { view: "default" },
    );
  },
});
