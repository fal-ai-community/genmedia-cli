import { defineCommand } from "citty";
import { renderBanner } from "../lib/banner";
import { loadConfig } from "../lib/config";
import { isPrettyOutput, output } from "../lib/output";
import { compareSemver } from "../lib/updater";
import { VERSION } from "../lib/version";

function getAvailableUpdate(): string | null {
  const latest = loadConfig().latestKnownVersion;
  if (!latest) return null;
  return compareSemver(latest, VERSION) > 0 ? latest : null;
}

export default defineCommand({
  meta: { name: "version", description: "Show version and check for updates" },
  args: {},
  async run() {
    const updateAvailable = getAvailableUpdate();

    if (isPrettyOutput()) {
      process.stdout.write(`${renderBanner(VERSION)}\n`);
      if (updateAvailable) {
        process.stdout.write(
          `Update available: ${VERSION} → ${updateAvailable}. Run \`genmedia update\` to install.\n`,
        );
      }
      return;
    }
    output({
      version: VERSION,
      update_available: updateAvailable,
    });
  },
});
