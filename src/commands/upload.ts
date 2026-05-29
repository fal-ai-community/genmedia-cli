import { defineCommand } from "citty";
import { output } from "../lib/output";
import { uploadToFalStorage } from "../lib/storage-upload";

export default defineCommand({
  meta: {
    name: "upload",
    description: "Upload a local file or URL to fal.ai CDN",
  },
  args: {
    target: {
      type: "positional",
      required: true,
      description: "File path or URL to upload",
    },
  },
  async run({ args }) {
    const cdnUrl = await uploadToFalStorage(args.target);
    output({
      cdn_url: cdnUrl,
      hint: "Use this URL as input to fal.ai models.",
    });
  },
});
