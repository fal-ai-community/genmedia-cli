import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "list", description: "List asset characters" },
  async run() {
    const data = await assetsRequest<{ characters: unknown[] }>({
      method: "GET",
      path: "/characters",
    });
    output(data);
  },
});
