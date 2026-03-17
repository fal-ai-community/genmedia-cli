import { defineCommand } from "citty";
import { output } from "../lib/output";
import { VERSION } from "../lib/version";

export default defineCommand({
  meta: { name: "version", description: "Show version and check for updates" },
  args: {},
  async run() {
    output({
      version: VERSION,
      update_available: null, // TBD: will compare against a hosted version.json
    });
  },
});
