export interface CliLogEntry {
  level: string;
  message: string;
  timestamp?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeLogs(logs: unknown): CliLogEntry[] {
  if (!Array.isArray(logs)) return [];

  return logs.flatMap((item) => {
    if (!isRecord(item) || typeof item.message !== "string") {
      return [];
    }

    return [
      {
        level: typeof item.level === "string" ? item.level : "INFO",
        message: item.message,
        ...(typeof item.timestamp === "string"
          ? { timestamp: item.timestamp }
          : {}),
      },
    ];
  });
}

export function collectUniqueLogs(
  incoming: unknown,
  seen: Set<string>,
  target: CliLogEntry[],
): CliLogEntry[] {
  const fresh: CliLogEntry[] = [];

  for (const log of normalizeLogs(incoming)) {
    const key = `${log.timestamp ?? ""}|${log.level}|${log.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(log);
    fresh.push(log);
  }

  return fresh;
}

export function describeQueueStatus(
  status: string,
  queuePosition?: number,
): string {
  switch (status) {
    case "IN_QUEUE":
      return typeof queuePosition === "number"
        ? `Waiting in queue (position ${queuePosition})`
        : "Waiting in queue";
    case "IN_PROGRESS":
      return "Model is running";
    case "COMPLETED":
      return "Finalizing response";
    default:
      return status;
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function getErrorDetails(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return error;
}
