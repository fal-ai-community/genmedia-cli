import { defineCommand } from "citty";
import {
  clearGallery,
  galleryPaths,
  resolveLatestSessionId,
} from "../../lib/gallery";
import { error, output } from "../../lib/output";
import { getSessionContext } from "../../lib/session";

export default defineCommand({
  meta: {
    name: "clear",
    description:
      "Delete recorded gallery sessions. Always requires --yes (no interactive prompt).",
  },
  args: {
    target: {
      type: "positional",
      required: false,
      description:
        'Target: "current" (default), "latest", "all", or a specific <session_id>',
    },
    yes: {
      type: "boolean",
      description:
        "Required confirmation flag — clears are destructive and irreversible",
    },
  },
  async run({ args }) {
    const target = (args.target ?? "current").trim();

    if (!args.yes) {
      error("`gallery clear` is destructive — pass --yes to confirm.", {
        examples: [
          "genmedia gallery clear --yes",
          "genmedia gallery clear latest --yes",
          "genmedia gallery clear all --yes",
        ],
      });
    }

    let sessionId: string | null = null;
    let all = false;
    let resolvedSource: "current" | "latest" | "explicit" | "all" = "current";

    if (target === "all") {
      all = true;
      resolvedSource = "all";
    } else if (target === "latest") {
      sessionId = resolveLatestSessionId();
      resolvedSource = "latest";
      if (!sessionId) {
        output(
          {
            scope: "clear",
            target: "latest",
            cleared: [],
            session_id: null,
            note: "No recorded sessions to clear.",
          },
          { view: "default" },
        );
        return;
      }
    } else if (target === "current" || target === "") {
      sessionId = getSessionContext().id;
      resolvedSource = "current";
    } else {
      sessionId = target;
      resolvedSource = "explicit";
    }

    const result = all
      ? clearGallery({ all: true })
      : clearGallery({ sessionId: sessionId ?? undefined });

    output(
      {
        scope: "clear",
        target: resolvedSource,
        ...(sessionId !== null ? { session_id: sessionId } : {}),
        ...(sessionId !== null && !all
          ? { url: galleryPaths(sessionId).index_url }
          : {}),
        cleared: result.cleared,
        cleared_count: result.cleared.length,
      },
      { view: "default" },
    );
  },
});
