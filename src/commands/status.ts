import { fal } from "@fal-ai/client";
import { defineCommand } from "citty";
import { configureSDK } from "../lib/api";
import {
  downloadMedia,
  extractMediaRefs,
  parseDownloadFlag,
} from "../lib/download";
import { error, output } from "../lib/output";
import { normalizeLogs } from "../lib/request-logs";

export default defineCommand({
  meta: { name: "status", description: "Check job status or get result" },
  args: {
    endpointId: {
      type: "positional",
      required: true,
      description: "Model endpoint ID",
    },
    requestId: {
      type: "positional",
      required: true,
      description: "Request ID",
    },
    logs: {
      type: "boolean",
      description: "Show logs verbosely in pretty terminal mode",
    },
    result: { type: "boolean", description: "Fetch the completed result" },
    cancel: { type: "boolean", description: "Cancel the job" },
    download: {
      type: "string",
      description:
        "Download media from the result. Implies --result. Optional value is a path or template with {index}, {name}, {ext}, {request_id}",
    },
  },
  async run({ args }) {
    configureSDK();

    const { endpointId, requestId } = args;
    const download = parseDownloadFlag(process.argv.slice(2));

    if (args.cancel) {
      if (download.mode === "on") {
        error("--download cannot be combined with --cancel");
      }
      await fal.queue.cancel(endpointId, { requestId });
      output(
        { status: "cancelled", request_id: requestId },
        { view: "status" },
      );
      return;
    }

    const wantResult = Boolean(args.result) || download.mode === "on";
    if (wantResult) {
      const result = await fal.queue.result(endpointId, { requestId });
      let downloaded: Awaited<ReturnType<typeof downloadMedia>> | undefined;
      if (download.mode === "on") {
        const refs = extractMediaRefs(result.data);
        downloaded =
          refs.length > 0
            ? await downloadMedia({
                refs,
                template: download.template,
                requestId,
              })
            : { downloaded: [], failed: [] };
      }
      output(
        {
          status: "completed",
          request_id: requestId,
          result: result.data,
          ...(downloaded ? { downloaded_files: downloaded.downloaded } : {}),
          ...(downloaded && downloaded.failed.length > 0
            ? { download_failures: downloaded.failed }
            : {}),
        },
        { view: "status", showLogs: Boolean(args.logs) },
      );
      return;
    }

    const status = await fal.queue.status(endpointId, {
      requestId,
      logs: true,
    });
    const out: Record<string, unknown> = {
      status: status.status,
      request_id: requestId,
    };
    if (status.status === "IN_QUEUE") {
      out.queue_position = status.queue_position;
    }
    if (
      (status.status === "IN_PROGRESS" || status.status === "COMPLETED") &&
      status.logs
    ) {
      const logs = normalizeLogs(status.logs);
      out.logs = args.logs ? logs : logs.slice(-5);
    }
    output(out, { view: "status", showLogs: Boolean(args.logs) });
  },
});
