import { defineCommand } from "citty";
import { renderBanner } from "../lib/banner";
import { isPrettyOutput, output } from "../lib/output";
import { VERSION } from "../lib/version";

export default defineCommand({
  meta: { name: "version", description: "Show version and check for updates" },
  args: {},
  async run() {
    if (isPrettyOutput()) {
      process.stdout.write(`${renderBanner(VERSION)}\n`);
      return;
    }
    output({
      version: VERSION,
      update_available: null, // TBD: will compare against a hosted version.json
    });
  },
});
