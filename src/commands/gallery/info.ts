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
import { output } from "../../lib/output";
import { getSessionContext } from "../../lib/session";

// Default subcommand. Prints the current session's gallery info — never
// destructive, never opens a browser. Use `gallery open` for that.
export default defineCommand({
  meta: {
    name: "info",
    description:
      "Print the current session's gallery info (path, url, exists). Default subcommand.",
  },
  async run() {
    const ctx = getSessionContext();
    const paths = galleryPaths(ctx.id);
    // Both URLs we emit point at on-disk HTML — refresh them against the
    // current template so anyone clicking through gets the latest UI.
    regenerateSessionHtml(ctx.id);
    regenerateRootIndexHtml();
    const exists = existsSync(paths.index_path);
    const last = readLastSession();

    const hasLatestElsewhere =
      !exists && last !== null && last.session_id !== ctx.id;

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
  },
});
