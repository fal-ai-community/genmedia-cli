import { fal } from "@fal-ai/client";
import { defineCommand } from "citty";
import { configureSDK } from "../lib/api";
import { formatApiError } from "../lib/error-format";
import { error, isPrettyOutput, output } from "../lib/output";
import { parseValue } from "../lib/parse-value";
import {
  type CliLogEntry,
  collectUniqueLogs,
  describeQueueStatus,
} from "../lib/request-logs";
import { colors, createSpinner } from "../lib/ui";

function formatLiveLog(log: CliLogEntry): string {
  const timestamp = log.timestamp ? ` ${colors.dim(log.timestamp)}` : "";
  return `  ${colors.bold(log.level.padEnd(7))} ${log.message}${timestamp}`;
}

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
    logs: {
      type: "boolean",
      description: "Stream logs while the model runs in pretty terminal mode",
    },
  },
  async run({ args }) {
    configureSDK();

    const { endpointId } = args;

    // Extract arbitrary model input params from process.argv (citty can't enumerate them)
    const argv = process.argv.slice(2);
    const input: Record<string, unknown> = {};
    const skipFlags = new Set(["--async", "--json", "--help", "--logs"]);
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
      output(
        {
          status: "submitted",
          request_id: result.request_id,
          endpoint_id: endpointId,
          hint: `Check status: genmedia status ${endpointId} ${result.request_id}`,
        },
        { view: "run" },
      );
      return;
    }

    const prettyMode = isPrettyOutput();
    const showLogs = Boolean(args.logs) && prettyMode;
    const spinner = prettyMode ? createSpinner("Submitting run") : null;
    const logs: CliLogEntry[] = [];
    const seenLogs = new Set<string>();
    let requestId: string | undefined;

    spinner?.start("Submitting run");

    try {
      const result = await fal.subscribe(endpointId, {
        input,
        logs: true,
        onEnqueue: (enqueuedRequestId) => {
          requestId = enqueuedRequestId;
          spinner?.update(`Queued request ${enqueuedRequestId}`);
        },
        onQueueUpdate: (update) => {
          requestId = update.request_id ?? requestId;
          spinner?.update(
            describeQueueStatus(
              update.status,
              "queue_position" in update ? update.queue_position : undefined,
            ),
          );

          const freshLogs = collectUniqueLogs(
            "logs" in update ? update.logs : undefined,
            seenLogs,
            logs,
          );
          if (showLogs) {
            for (const log of freshLogs) {
              spinner?.log(formatLiveLog(log));
            }
          }
        },
      });

      requestId = result.requestId;
      spinner?.succeed(`Run completed (${result.requestId})`);

      output(
        {
          status: "completed",
          endpoint_id: endpointId,
          request_id: result.requestId,
          result: result.data,
          ...(logs.length > 0 ? { logs } : {}),
        },
        { view: "run", showLogs },
      );
    } catch (runError) {
      spinner?.fail(requestId ? `Run failed (${requestId})` : "Run failed");
      const formatted = formatApiError(runError, "Run failed");
      error(
        formatted.message,
        {
          endpoint_id: endpointId,
          ...(requestId ? { request_id: requestId } : {}),
          ...(formatted.status !== undefined
            ? { status: formatted.status }
            : {}),
          error_type: formatted.name,
          ...(formatted.validation_errors
            ? { validation_errors: formatted.validation_errors }
            : {}),
          ...(logs.length > 0 ? { logs: logs.slice(-10) } : {}),
          ...(formatted.body !== undefined ? { body: formatted.body } : {}),
        },
        { view: "run", showLogs: true },
      );
    }
  },
});
