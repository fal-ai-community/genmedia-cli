import { fal } from "@fal-ai/client";
import { defineCommand } from "citty";
import { configureSDK } from "../lib/api";
import {
  downloadMedia,
  extractMediaRefs,
  parseDownloadFlag,
} from "../lib/download";
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
    download: {
      type: "string",
      description:
        "Download media from the result. Optional value is a path or template with {index}, {name}, {ext}, {request_id}",
    },
  },
  async run({ args }) {
    configureSDK();

    const { endpointId } = args;

    const argv = process.argv.slice(2);
    const download = parseDownloadFlag(argv);

    // Extract arbitrary model input params from process.argv (citty can't enumerate them)
    const input: Record<string, unknown> = {};
    const skipFlags = new Set([
      "--async",
      "--json",
      "--help",
      "--logs",
      "--download",
    ]);
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
      } else if (a === "--download") {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) i++;
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

      let downloaded: Awaited<ReturnType<typeof downloadMedia>> | undefined;
      if (download.mode === "on") {
        const refs = extractMediaRefs(result.data);
        if (refs.length > 0) {
          const spinnerDl = prettyMode
            ? createSpinner(`Downloading ${refs.length} file(s)`)
            : null;
          spinnerDl?.start(`Downloading ${refs.length} file(s)`);
          downloaded = await downloadMedia({
            refs,
            template: download.template,
            requestId: result.requestId,
          });
          if (downloaded.failed.length === 0) {
            spinnerDl?.succeed(
              `Downloaded ${downloaded.downloaded.length} file(s)`,
            );
          } else if (downloaded.downloaded.length === 0) {
            spinnerDl?.fail(
              `All ${downloaded.failed.length} download(s) failed`,
            );
          } else {
            spinnerDl?.fail(
              `Downloaded ${downloaded.downloaded.length}, ${downloaded.failed.length} failed`,
            );
          }
        } else {
          downloaded = { downloaded: [], failed: [] };
        }
      }

      output(
        {
          status: "completed",
          endpoint_id: endpointId,
          request_id: result.requestId,
          result: result.data,
          ...(downloaded ? { downloaded_files: downloaded.downloaded } : {}),
          ...(downloaded && downloaded.failed.length > 0
            ? { download_failures: downloaded.failed }
            : {}),
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
