import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import {
  galleryPaths,
  isGalleryDisabled,
  readLastSession,
  regenerateRootIndexHtml,
  regenerateSessionHtml,
  rootIndexUrl,
} from "../../lib/gallery";
import { isJsonOutput, output } from "../../lib/output";
import { getSessionContext } from "../../lib/session";
import { colors } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "info",
    description:
      "Show gallery info. `gallery info` (explicit) or `--json` prints the full payload + open hint; bare `gallery` in pretty TTY prints just the hint.",
  },
  async run() {
    const ctx = getSessionContext();
    const paths = galleryPaths(ctx.id);
    // Refresh on-disk HTML so the URL we hand back uses the current template.
    regenerateSessionHtml(ctx.id);
    regenerateRootIndexHtml();
    const exists = existsSync(paths.index_path);
    const last = readLastSession();
    const hasLatestElsewhere =
      !exists && last !== null && last.session_id !== ctx.id;

    // `gallery info` is the explicit "give me everything" form. Bare
    // `gallery` (routed here via `default: "info"`) defaults to the compact
    // open hint when stdout is pretty/TTY.
    const explicitInfo = process.argv.includes("info");

    const url = exists
      ? paths.index_url
      : hasLatestElsewhere
        ? rootIndexUrl()
        : null;

    const openHint =
      url === null
        ? null
        : `${colors.bold(colors.cyan("→"))} ${colors.bold("Open:")} ${colors.cyan(url)}`;

    if (isJsonOutput() || explicitInfo) {
      output(
        {
          scope: "session",
          session_id: ctx.id,
          session_source: ctx.source,
          agent: ctx.agent,
          agent_host: ctx.agentHost,
          path: paths.index_path,
          url: paths.index_url,
          exists,
          recording_disabled: isGalleryDisabled(),
          index_url: rootIndexUrl(),
          ...(hasLatestElsewhere
            ? {
                latest: {
                  session_id: last.session_id,
                  agent: last.agent,
                  updated_at: last.updated_at,
                  hint: "Open it with `genmedia gallery open latest`.",
                },
              }
            : {}),
          ...(exists
            ? {}
            : {
                hint: hasLatestElsewhere
                  ? "This shell resolves to a different session than your last recording. Try `genmedia gallery open latest`."
                  : "No assets have been recorded for this session yet — run a model first.",
              }),
        },
        { view: "default" },
      );
      if (!isJsonOutput() && openHint !== null) {
        const rule = colors.dim("─".repeat(60));
        process.stdout.write(`\n${rule}\n${openHint}\n`);
      }
      return;
    }

    if (openHint === null) {
      process.stdout.write(
        `${colors.dim("No assets recorded yet — run `genmedia run` to generate something.")}\n`,
      );
      return;
    }

    process.stdout.write(`${openHint}\n`);
  },
});
