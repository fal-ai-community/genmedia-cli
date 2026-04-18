import { PLATFORM_BASE, platformHeaders } from "./api";

export interface ModelSchemaFetchResult {
  model: Record<string, unknown>;
  meta: Record<string, unknown>;
  openapi: Record<string, unknown> | undefined;
  inputSchema: Record<string, unknown> | undefined;
  outputSchema: Record<string, unknown> | undefined;
}

export interface ModelSchemaFetchFailure {
  status: "not-found" | "http-error" | "network-error";
  httpStatus?: number;
  body?: string;
  message?: string;
}

export type ModelSchemaResponse =
  | { ok: true; data: ModelSchemaFetchResult }
  | { ok: false; failure: ModelSchemaFetchFailure };

export async function fetchModelSchema(
  endpointId: string,
): Promise<ModelSchemaResponse> {
  const url = new URL(`${PLATFORM_BASE}/models`);
  url.searchParams.set("endpoint_id", endpointId);
  url.searchParams.set("expand", "openapi-3.0");

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: platformHeaders() });
  } catch (err) {
    return {
      ok: false,
      failure: {
        status: "network-error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      failure: {
        status: "http-error",
        httpStatus: res.status,
        body: await res.text(),
      },
    };
  }

  const data = (await res.json()) as {
    models?: Array<Record<string, unknown>>;
  };
  if (!data.models?.length) {
    return { ok: false, failure: { status: "not-found" } };
  }

  const model = data.models[0];
  const openapi = model.openapi as Record<string, unknown> | undefined;
  const components = openapi?.components as Record<string, unknown> | undefined;
  const schemas = components?.schemas as
    | Record<string, Record<string, unknown>>
    | undefined;

  let inputSchema: Record<string, unknown> | undefined;
  let outputSchema: Record<string, unknown> | undefined;
  if (schemas) {
    for (const [name, schema] of Object.entries(schemas)) {
      const lower = name.toLowerCase();
      if (lower === "input" || lower === "request" || lower.endsWith("input")) {
        inputSchema = schema;
      }
      if (
        lower === "output" ||
        lower === "response" ||
        lower.endsWith("output")
      ) {
        outputSchema = schema;
      }
    }
  }

  const meta = (model.metadata as Record<string, unknown>) || {};

  return {
    ok: true,
    data: { model, meta, openapi, inputSchema, outputSchema },
  };
}
