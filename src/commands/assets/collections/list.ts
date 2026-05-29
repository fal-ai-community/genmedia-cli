import { defineCommand } from "citty";
import { assetsRequest } from "../../../lib/assets";
import { output } from "../../../lib/output";

export default defineCommand({
  meta: { name: "list", description: "List asset collections" },
  args: {
    limit: {
      type: "string",
      default: "50",
      description: "Max collections to return (default: 50, max: 100)",
    },
    offset: {
      type: "string",
      default: "0",
      description: "Number of collections to skip",
    },
  },
  async run({ args }) {
    const data = await assetsRequest<{ collections: unknown[] }>({
      method: "GET",
      path: "/collections",
      query: { limit: args.limit, offset: args.offset },
    });
    output(data);
  },
});
