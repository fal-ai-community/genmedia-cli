import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "get", description: "Get an asset collection" },
  args: {
    collection_id: {
      type: "positional",
      required: true,
      description: "Collection ID",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ collection: unknown }>({
      method: "GET",
      path: `/collections/${args.collection_id}`,
    });
    output(data);
  },
});
