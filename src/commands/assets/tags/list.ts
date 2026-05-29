import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "list", description: "List asset tags" },
  async run() {
    const data = await assetsRequest<{ tags: unknown[] }>({
      method: "GET",
      path: "/tags",
    });
    output(data);
  },
});
