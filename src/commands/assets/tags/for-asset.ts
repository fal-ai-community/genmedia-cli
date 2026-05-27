import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "for-asset", description: "List tags assigned to an asset" },
  args: {
    asset_id: {
      type: "positional",
      required: true,
      description: "Asset ID",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ tags: unknown[] }>({
      method: "GET",
      path: `/${args.asset_id}/tags`,
    });
    output(data);
  },
});
