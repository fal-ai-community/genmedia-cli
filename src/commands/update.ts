import { defineCommand } from "citty";
import { error, isJsonOutput, output } from "../lib/output";
import { colors, createSpinner } from "../lib/ui";
import { runManualUpdate } from "../lib/updater";

export default defineCommand({
  meta: {
    name: "update",
    description: "Check for and apply updates to the genmedia CLI",
  },
  args: {
    check: {
      type: "boolean",
      description: "Only check for a newer version; don't download",
    },
    force: {
      type: "boolean",
      description: "Re-download and reinstall even if already on the latest",
    },
  },
  async run({ args }) {
    const checkOnly = Boolean(args.check);
    const force = Boolean(args.force);
    const json = isJsonOutput();

    const spinner = json ? null : createSpinner("Checking for updates…");
    spinner?.start();

    const result = await runManualUpdate({ checkOnly, force });

    if (result.error) {
      spinner?.fail(result.error);
      error(result.error, {
        current: result.current,
        latest: result.latest,
        ...(result.staged_path ? { staged_path: result.staged_path } : {}),
      });
    }

    const hasUpdate =
      result.latest !== null && result.latest !== result.current;

    if (checkOnly) {
      spinner?.succeed(
        hasUpdate
          ? `Update available: ${result.current} → ${result.latest}`
          : `Already on the latest version (${result.current})`,
      );
      if (json) output(result);
      return;
    }

    if (result.updated) {
      spinner?.succeed(`Updated ${result.current} → ${result.latest}`);
      if (json) {
        output(result);
      } else {
        process.stdout.write(
          `${colors.dim("Run `genmedia version` to verify.")}\n`,
        );
      }
      return;
    }

    spinner?.succeed(`Already on the latest version (${result.current})`);
    if (json) output(result);
  },
});
