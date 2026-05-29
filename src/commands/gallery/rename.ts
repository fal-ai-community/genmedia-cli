import { defineCommand } from "citty";
import {
  galleryPaths,
  LABEL_MAX_LENGTH,
  renameSession,
  resolveLatestSessionId,
} from "../../lib/gallery";
import { error, output } from "../../lib/output";
import { getSessionContext } from "../../lib/session";

export default defineCommand({
  meta: {
    name: "rename",
    description:
      "Set or clear a display label for a session. The on-disk id is unchanged.",
  },
  args: {
    target: {
      type: "positional",
      required: false,
      description:
        'Target: "current" (default), "latest", or a specific <session_id>',
    },
    label: {
      type: "string",
      description: `Display label (max ${LABEL_MAX_LENGTH} chars)`,
    },
    clear: {
      type: "boolean",
      description: "Remove the label instead of setting one",
    },
  },
  async run({ args }) {
    const hasLabel = typeof args.label === "string" && args.label !== "";
    if (!hasLabel && !args.clear) {
      error("`gallery rename` requires either --label '<name>' or --clear.", {
        examples: [
          "genmedia gallery rename --label 'fluffy dog batch'",
          "genmedia gallery rename latest --label 'demo run'",
          "genmedia gallery rename <session_id> --clear",
        ],
      });
    }
    if (hasLabel && args.clear) {
      error("Pass --label OR --clear, not both.");
    }

    const target = (args.target ?? "current").trim();
    let sessionId: string;
    let source: "current" | "latest" | "explicit";
    if (target === "latest") {
      const id = resolveLatestSessionId();
      if (!id) {
        error("No recorded sessions to rename.", {
          hint: "Run `genmedia run` first.",
        });
      }
      sessionId = id;
      source = "latest";
    } else if (target === "current" || target === "") {
      sessionId = getSessionContext().id;
      source = "current";
    } else {
      sessionId = target;
      source = "explicit";
    }

    const desired = args.clear ? null : (args.label as string);
    const result = renameSession(sessionId, desired);
    if (!result.ok) {
      const message =
        result.reason === "not-found"
          ? `Session not found: ${sessionId}`
          : result.reason === "too-long"
            ? `Label too long — max ${LABEL_MAX_LENGTH} chars.`
            : "Failed to write the label.";
      error(message, { session_id: sessionId });
    }

    output(
      {
        scope: "rename",
        target: source,
        session_id: sessionId,
        label: result.label,
        url: galleryPaths(sessionId).index_url,
      },
      { view: "default" },
    );
  },
});
