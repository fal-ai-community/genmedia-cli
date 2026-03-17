import { fal } from "@fal-ai/client";
import { defineCommand } from "citty";
import { configureSDK } from "../lib/api";
import { output } from "../lib/output";
import { parseValue } from "../lib/parse-value";

export default defineCommand({
  meta: { name: "run", description: "Run any model (waits for result)" },
  args: {
    endpointId: {
      type: "positional",
      required: true,
      description: "Model endpoint ID",
    },
    async: {
      type: "boolean",
      description: "Submit to queue instead of waiting (returns request_id)",
    },
  },
  async run({ args }) {
    configureSDK();

    const { endpointId } = args;

    // Extract arbitrary model input params from process.argv (citty can't enumerate them)
    const argv = process.argv.slice(2);
    const input: Record<string, unknown> = {};
    const skipFlags = new Set(["--async", "--json", "--help"]);
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a.startsWith("--") && !skipFlags.has(a)) {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          input[a.slice(2)] = parseValue(next);
          i++;
        } else {
          input[a.slice(2)] = true;
        }
      }
    }

    if (args.async) {
      const result = await fal.queue.submit(endpointId, { input });
      output({
        status: "submitted",
        request_id: result.request_id,
        endpoint_id: endpointId,
        hint: `Check status: falgen status ${endpointId} ${result.request_id}`,
      });
      return;
    }

    const logs: Array<{ message: string; level: string }> = [];
    const result = await fal.subscribe(endpointId, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if ("logs" in update && update.logs) {
          for (const log of update.logs) {
            logs.push({ message: log.message, level: log.level || "info" });
            console.error(`[${log.level || "info"}] ${log.message}`);
          }
        }
      },
    });

    output({
      status: "completed",
      request_id: result.requestId,
      result: result.data,
      ...(logs.length > 0 ? { logs } : {}),
    });
  },
});
