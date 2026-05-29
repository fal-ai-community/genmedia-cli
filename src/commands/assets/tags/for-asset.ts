import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "for-asset", description: "List tags assigned to an asset" },
  args: {
    vector_id: {
      type: "positional",
      required: true,
      description: "Vector ID",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ tags: unknown[] }>({
      method: "GET",
      path: `/${args.vector_id}/tags`,
    });
    output(data);
  },
});
