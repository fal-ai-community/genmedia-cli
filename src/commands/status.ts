import { fal } from "@fal-ai/client";
import { defineCommand } from "citty";
import { configureSDK } from "../lib/api";
import { output } from "../lib/output";

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
    result: { type: "boolean", description: "Fetch the completed result" },
    cancel: { type: "boolean", description: "Cancel the job" },
  },
  async run({ args }) {
    configureSDK();

    const { endpointId, requestId } = args;

    if (args.cancel) {
      await fal.queue.cancel(endpointId, { requestId });
      output({ status: "cancelled", request_id: requestId });
      return;
    }

    if (args.result) {
      const result = await fal.queue.result(endpointId, { requestId });
      output({
        status: "completed",
        request_id: requestId,
        result: result.data,
      });
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
      out.logs = status.logs.slice(-5);
    }
    output(out);
  },
});
