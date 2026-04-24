import { ApiError, ValidationError } from "@fal-ai/client";

export interface FieldIssue {
  field: string;
  message: string;
  type?: string;
  input?: unknown;
}

export interface FormattedApiError {
  name: string;
  message: string;
  status?: number;
  request_id?: string;
  validation_errors?: FieldIssue[];
  body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatLoc(loc: unknown): string {
  if (!Array.isArray(loc) || loc.length === 0) return "body";
  const parts = loc[0] === "body" ? loc.slice(1) : loc;
  if (parts.length === 0) return "body";
  return parts
    .map((part, index) => {
      if (typeof part === "number") return `[${part}]`;
      return index === 0 ? String(part) : `.${String(part)}`;
    })
    .join("");
}

function extractFieldIssues(body: unknown): FieldIssue[] | undefined {
  if (!isRecord(body)) return undefined;
  const detail = body.detail;

  if (!Array.isArray(detail)) return undefined;

  const issues = detail.flatMap<FieldIssue>((item) => {
    if (!isRecord(item)) return [];
    const rawMessage =
      typeof item.msg === "string"
        ? item.msg
        : typeof item.message === "string"
          ? item.message
          : undefined;
    if (!rawMessage) return [];
    return [
      {
        field: formatLoc(item.loc),
        message: rawMessage,
        ...(typeof item.type === "string" ? { type: item.type } : {}),
        ...("input" in item ? { input: item.input } : {}),
      },
    ];
  });

  return issues.length > 0 ? issues : undefined;
}

function describeValidation(issues: FieldIssue[]): string {
  if (issues.length === 1) {
    const [issue] = issues;
    return `Validation error — ${issue.field}: ${issue.message}`;
  }
  return `Validation error — ${issues.length} problems with the input`;
}

function extractBodyMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  if (typeof body.detail === "string") return body.detail;
  if (typeof body.message === "string") return body.message;
  if (typeof body.error === "string") return body.error;
  return undefined;
}

export function formatApiError(
  err: unknown,
  fallback: string,
): FormattedApiError {
  if (err instanceof ValidationError) {
    const validation_errors = extractFieldIssues(err.body);
    const message = validation_errors
      ? describeValidation(validation_errors)
      : extractBodyMessage(err.body) || err.message || fallback;
    return {
      name: "ValidationError",
      message,
      status: err.status,
      ...(err.requestId ? { request_id: err.requestId } : {}),
      ...(validation_errors ? { validation_errors } : {}),
      ...(err.body !== undefined ? { body: err.body } : {}),
    };
  }

  if (err instanceof ApiError) {
    const validation_errors = extractFieldIssues(err.body);
    const bodyMessage = extractBodyMessage(err.body);
    const message = validation_errors
      ? describeValidation(validation_errors)
      : bodyMessage || err.message || fallback;
    return {
      name: "ApiError",
      message,
      status: err.status,
      ...(err.requestId ? { request_id: err.requestId } : {}),
      ...(validation_errors ? { validation_errors } : {}),
      ...(err.body !== undefined ? { body: err.body } : {}),
    };
  }

  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || fallback,
    };
  }

  return {
    name: "Error",
    message: typeof err === "string" && err ? err : fallback,
  };
}
