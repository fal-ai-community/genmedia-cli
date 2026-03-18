/**
 * Skill templates installed by `falgen init` into .claude/commands/.
 *
 * falgen-ref.md  — background reference loaded automatically by Claude
 * falgen.md      — /falgen workflow skill for guided task execution
 */

export const FALGEN_REF_SKILL = `---
description: >
  Complete falgen CLI reference for fal.ai — consult this whenever the user
  asks you to search for models, run inference, upload files, check pricing,
  or manage async jobs on fal.ai. Use --json on every command to get
  structured output you can parse.
---

# falgen CLI reference

falgen is an agent-first CLI for fal.ai. Every command emits structured JSON
when called with \`--json\` or when stdout is not a TTY.

## Authentication

falgen reads credentials from (in priority order):

1. \`FAL_KEY\` environment variable
2. \`~/.falgen/config.json\` (written by \`falgen setup\`)
3. A project \`.env\` file (if auto-load is enabled via \`falgen setup\`)

## Commands

### search — find models

\`\`\`
falgen search <query> [--category <cat>] [--status active|deprecated|all] [--limit <n>] [--cursor <token>] [--json]
\`\`\`

Returns a list of models with endpoint_id, name, category, and description.
Use \`--cursor\` from a previous response to page through results.

### models — list and inspect models

\`\`\`
falgen models [query] [--category <cat>] [--status active|deprecated|all] [--limit <n>] [--cursor <token>] [--endpoint_id <id,...>] [--expand openapi-3.0] [--json]
\`\`\`

Like search but more powerful. Use \`--endpoint_id\` to fetch specific models
by ID. Use \`--expand openapi-3.0\` to get the full OpenAPI schema for each model.

### schema — inspect model inputs/outputs

\`\`\`
falgen schema <endpoint_id> [--format compact|openapi] [--json]
\`\`\`

Shows the input parameters and output shape for a model.
\`--format openapi\` returns the full raw OpenAPI spec.
Always run this before \`falgen run\` to know what parameters the model accepts.

### run — execute a model

\`\`\`
falgen run <endpoint_id> --<param> <value> ... [--async] [--logs] [--json]
\`\`\`

Pass any model input parameter as a \`--flag value\` pair.
Waits for the result by default and returns \`{ status, endpoint_id, request_id, result }\`.

Use \`--async\` for long-running models (video generation, etc.).
Returns \`{ status: "submitted", request_id, endpoint_id }\` immediately.
Then poll with \`falgen status\`.

### status — check or retrieve an async job

\`\`\`
falgen status <endpoint_id> <request_id> [--result] [--logs] [--cancel] [--json]
\`\`\`

Without flags: returns queue position and job status.
\`--result\`: blocks until complete and returns the full result.
\`--cancel\`: cancels a queued job.

### upload — upload a file to fal.ai CDN

\`\`\`
falgen upload <file_path_or_url> [--json]
\`\`\`

Accepts a local file path or a remote URL. Returns a CDN URL suitable for
use as a model input parameter (e.g. \`--image_url\`).

### pricing — check model cost

\`\`\`
falgen pricing <endpoint_id> [--json]
\`\`\`

### docs — search fal.ai documentation

\`\`\`
falgen docs <query> [--json]
\`\`\`

## Common workflows

### Synchronous inference (fast models)
\`\`\`
falgen schema fal-ai/flux/dev --json
falgen run fal-ai/flux/dev --prompt "a cat on the moon" --json
\`\`\`

### Async inference (slow models — video, etc.)
\`\`\`
falgen run fal-ai/veo3.1 --prompt "a dog running" --async --json
# save the request_id from the response, then:
falgen status fal-ai/veo3.1 <request_id> --result --json
\`\`\`

### Using a local image as input
\`\`\`
falgen upload ./photo.jpg --json
# use the returned url as input:
falgen run fal-ai/some-model --image_url <cdn_url> --json
\`\`\`

### Discovering models for a task
\`\`\`
falgen search "text to video" --json
falgen schema <endpoint_id> --json
\`\`\`
`;

export const FALGEN_WORKFLOW_SKILL = `---
description: >
  Run a fal.ai model end-to-end with falgen. Accepts a task description or
  a specific endpoint_id as an argument. Guides through model discovery,
  schema inspection, input preparation, execution, and result handling.
---

# falgen workflow

Task or endpoint: $ARGUMENTS

## Steps

1. **Discover** — If no endpoint_id is given, search for a suitable model:
   \`\`\`
   falgen search "<task>" --json
   \`\`\`

2. **Inspect** — Get the model's input parameters:
   \`\`\`
   falgen schema <endpoint_id> --json
   \`\`\`
   Read all required fields before running.

3. **Upload files** (if inputs include images/video/audio):
   \`\`\`
   falgen upload <local_file_or_url> --json
   \`\`\`
   Use the returned \`url\` as the parameter value.

4. **Run** the model:
   - Fast model (completes in seconds):
     \`\`\`
     falgen run <endpoint_id> --<param> <value> ... --json
     \`\`\`
   - Slow model (video generation, large jobs):
     \`\`\`
     falgen run <endpoint_id> --<param> <value> ... --async --json
     falgen status <endpoint_id> <request_id> --result --json
     \`\`\`

5. **Return** the result to the user. If the result contains URLs (images,
   video, audio), present them clearly. If something failed, check the
   \`logs\` field in the response for model-side errors.

## Notes

- Always use \`--json\` so output is machine-readable.
- Run \`falgen pricing <endpoint_id> --json\` first if cost is a concern.
- If unsure which model to pick, run \`falgen docs "<task>" --json\` for
  guidance from fal.ai documentation.
`;
