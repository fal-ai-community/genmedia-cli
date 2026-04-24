---
name: genmedia-ref
description: >
  Complete genmedia CLI reference for fal.ai — consult this whenever the user
  asks you to search for models, run inference, upload files, check pricing,
  or manage async jobs on fal.ai. Use --json on every command to get
  structured output you can parse.
---

# genmedia CLI reference

genmedia is an agent-first CLI for fal.ai. Every command emits structured JSON
when called with `--json` or when stdout is not a TTY.

## Authentication

genmedia reads credentials from (in priority order):

1. `FAL_KEY` environment variable
2. `~/.genmedia/config.json` (written by `genmedia setup`)
3. A project `.env` file (if auto-load is enabled via `genmedia setup`)

## Commands

### models — search and inspect models

```
genmedia models [query] [--category <cat>] [--status active|deprecated|all] [--limit <n>] [--cursor <token>] [--endpoint_id <id,...>] [--expand openapi-3.0] [--json]
```

Free-text search across 600+ models. Use `--endpoint_id` to fetch specific
models by ID. Use `--expand openapi-3.0` to get the full OpenAPI schema.
Use `--cursor` from a previous response to page through results.

### schema — inspect model inputs/outputs

```
genmedia schema <endpoint_id> [--format compact|openapi] [--json]
```

Shows the input parameters and output shape for a model.
`--format openapi` returns the full raw OpenAPI spec.
Always run this before `genmedia run` to know what parameters the model accepts.

### run — execute a model

```
genmedia run <endpoint_id> --<param> <value> ... [--async] [--logs] [--json]
```

Pass any model input parameter as a `--flag value` pair.
Waits for the result by default and returns `{ status, endpoint_id, request_id, result }`.

Use `--async` for long-running models (video generation, etc.).
Returns `{ status: "submitted", request_id, endpoint_id }` immediately.
Then poll with `genmedia status`.

### status — check or retrieve an async job

```
genmedia status <endpoint_id> <request_id> [--result] [--logs] [--cancel] [--json]
```

Without flags: returns queue position and job status.
`--result`: blocks until complete and returns the full result.
`--cancel`: cancels a queued job.

### upload — upload a file to fal.ai CDN

```
genmedia upload <file_path_or_url> [--json]
```

Accepts a local file path or a remote URL. Returns a CDN URL suitable for
use as a model input parameter (e.g. `--image_url`).

### pricing — check model cost

```
genmedia pricing <endpoint_id> [--json]
```

### docs — search fal.ai documentation

```
genmedia docs <query> [--json]
```

## Error output

Every command exits non-zero on failure and writes a JSON error object to
stderr. The shape is stable across commands:

```json
{
  "error": "<human-readable summary>",
  "details": {
    "endpoint_id": "fal-ai/flux/schnell",
    "request_id": "019d...",
    "status": 422,
    "error_type": "ValidationError" | "ApiError" | "Error",
    "validation_errors": [
      {
        "field": "num_images",
        "message": "Input should be less than or equal to 4",
        "type": "less_than_equal",
        "input": 20
      }
    ],
    "body": { "detail": [ ... raw server payload ... ] },
    "logs": [ { "level": "ERROR", "message": "...", "timestamp": "..." } ]
  }
}
```

Field meanings:

- `error` — one-line summary you can show the user.
- `details.status` — HTTP status from fal.ai (`422` input validation, `401`
  unauthenticated, `403` forbidden, `404` endpoint not found, `429` rate
  limited, `5xx` upstream). Missing for local errors (network, parsing).
- `details.error_type` — `ValidationError` for 422 with FastAPI-style
  `detail[]`; `ApiError` for other HTTP failures; `Error` for local errors.
- `details.validation_errors` — present only when the server returned a
  FastAPI validation payload. Each entry is `{ field, message, type, input }`
  and uniquely identifies what the agent needs to fix. Dotted field paths
  like `options.seed` or `images[0].url` point at nested inputs.
- `details.body` — the raw response body, preserved for agents that need
  the full FastAPI `ctx`/`expected` fields or vendor-specific payloads.
- `details.logs` — recent model-side log lines when the failure happened
  during inference (not for pre-flight validation errors).
- `details.request_id` — included when the request reached fal.ai; pass it
  to `genmedia status <endpoint_id> <request_id> --logs --json` for full
  history.

Agent guidance:

- For `status: 422`, read `validation_errors`, correct the offending args,
  and retry. Re-run `genmedia schema <endpoint_id> --json` if you need
  allowed enum values or numeric bounds.
- For `401`/`403`, check credentials — do not retry.
- For `404`, verify the `endpoint_id` with `genmedia models ... --json`.
- For `429` or `5xx`, a short backoff-and-retry is acceptable; everything
  else should be surfaced to the user.

## Common workflows

### Synchronous inference (fast models)
```
genmedia schema fal-ai/flux/dev --json
genmedia run fal-ai/flux/dev --prompt "a cat on the moon" --json
```

### Async inference (slow models — video, etc.)
```
genmedia run fal-ai/veo3.1 --prompt "a dog running" --async --json
# save the request_id from the response, then:
genmedia status fal-ai/veo3.1 <request_id> --result --json
```

### Using a local image as input
```
genmedia upload ./photo.jpg --json
# use the returned url as input:
genmedia run fal-ai/some-model --image_url <cdn_url> --json
```

### Discovering models for a task
```
genmedia models "text to video" --json
genmedia schema <endpoint_id> --json
```
