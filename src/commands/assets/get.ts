import { defineCommand } from "citty";
import { assetsRequest } from "../../lib/assets";
import { output } from "../../lib/output";

export default defineCommand({
  meta: {
    name: "get",
    description: "Get a persisted asset by ID",
  },
  args: {
    asset_id: {
      type: "positional",
      required: true,
      description: "Asset ID",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ asset: unknown }>({
      method: "GET",
      path: `/${args.asset_id}`,
    });
    output(data);
  },
});
