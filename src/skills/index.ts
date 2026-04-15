/**
 * Skill templates installed by `genmedia init` into .claude/commands/.
 *
 * genmedia-ref.md  — background reference loaded automatically by Claude
 * genmedia.md      — /genmedia workflow skill for guided task execution
 */

export const GENMEDIA_REF_SKILL = `---
description: >
  Complete genmedia CLI reference for fal.ai — consult this whenever the user
  asks you to search for models, run inference, upload files, check pricing,
  or manage async jobs on fal.ai. Use --json on every command to get
  structured output you can parse.
---

# genmedia CLI reference

genmedia is an agent-first CLI for fal.ai. Every command emits structured JSON
when called with \`--json\` or when stdout is not a TTY.

## Authentication

genmedia reads credentials from (in priority order):

1. \`FAL_KEY\` environment variable
2. \`~/.genmedia/config.json\` (written by \`genmedia setup\`)
3. A project \`.env\` file (if auto-load is enabled via \`genmedia setup\`)

## Commands

### models — search and inspect models

\`\`\`
genmedia models [query] [--category <cat>] [--status active|deprecated|all] [--limit <n>] [--cursor <token>] [--endpoint_id <id,...>] [--expand openapi-3.0] [--json]
\`\`\`

Free-text search across 600+ models. Use \`--endpoint_id\` to fetch specific
models by ID. Use \`--expand openapi-3.0\` to get the full OpenAPI schema.
Use \`--cursor\` from a previous response to page through results.

### schema — inspect model inputs/outputs

\`\`\`
genmedia schema <endpoint_id> [--format compact|openapi] [--json]
\`\`\`

Shows the input parameters and output shape for a model.
\`--format openapi\` returns the full raw OpenAPI spec.
Always run this before \`genmedia run\` to know what parameters the model accepts.

### run — execute a model

\`\`\`
genmedia run <endpoint_id> --<param> <value> ... [--async] [--logs] [--json]
\`\`\`

Pass any model input parameter as a \`--flag value\` pair.
Waits for the result by default and returns \`{ status, endpoint_id, request_id, result }\`.

Use \`--async\` for long-running models (video generation, etc.).
Returns \`{ status: "submitted", request_id, endpoint_id }\` immediately.
Then poll with \`genmedia status\`.

### status — check or retrieve an async job

\`\`\`
genmedia status <endpoint_id> <request_id> [--result] [--logs] [--cancel] [--json]
\`\`\`

Without flags: returns queue position and job status.
\`--result\`: blocks until complete and returns the full result.
\`--cancel\`: cancels a queued job.

### upload — upload a file to fal.ai CDN

\`\`\`
genmedia upload <file_path_or_url> [--json]
\`\`\`

Accepts a local file path or a remote URL. Returns a CDN URL suitable for
use as a model input parameter (e.g. \`--image_url\`).

### pricing — check model cost

\`\`\`
genmedia pricing <endpoint_id> [--json]
\`\`\`

### docs — search fal.ai documentation

\`\`\`
genmedia docs <query> [--json]
\`\`\`

## Common workflows

### Synchronous inference (fast models)
\`\`\`
genmedia schema fal-ai/flux/dev --json
genmedia run fal-ai/flux/dev --prompt "a cat on the moon" --json
\`\`\`

### Async inference (slow models — video, etc.)
\`\`\`
genmedia run fal-ai/veo3.1 --prompt "a dog running" --async --json
# save the request_id from the response, then:
genmedia status fal-ai/veo3.1 <request_id> --result --json
\`\`\`

### Using a local image as input
\`\`\`
genmedia upload ./photo.jpg --json
# use the returned url as input:
genmedia run fal-ai/some-model --image_url <cdn_url> --json
\`\`\`

### Discovering models for a task
\`\`\`
genmedia models "text to video" --json
genmedia schema <endpoint_id> --json
\`\`\`
`;

export const GENMEDIA_WORKFLOW_SKILL = `---
description: >
  Run a fal.ai model end-to-end with genmedia. Accepts a task description or
  a specific endpoint_id as an argument. Guides through model discovery,
  schema inspection, input preparation, execution, and result handling.
---

# genmedia workflow

Task or endpoint: $ARGUMENTS

## Steps

1. **Discover** — If no endpoint_id is given, search for a suitable model:
   \`\`\`
   genmedia models "<task>" --json
   \`\`\`

2. **Inspect** — Get the model's input parameters:
   \`\`\`
   genmedia schema <endpoint_id> --json
   \`\`\`
   Read all required fields before running.

3. **Upload files** (if inputs include images/video/audio):
   \`\`\`
   genmedia upload <local_file_or_url> --json
   \`\`\`
   Use the returned \`url\` as the parameter value.

4. **Run** the model:
   - Fast model (completes in seconds):
     \`\`\`
     genmedia run <endpoint_id> --<param> <value> ... --json
     \`\`\`
   - Slow model (video generation, large jobs):
     \`\`\`
     genmedia run <endpoint_id> --<param> <value> ... --async --json
     genmedia status <endpoint_id> <request_id> --result --json
     \`\`\`

5. **Return** the result to the user. If the result contains URLs (images,
   video, audio), present them clearly. If something failed, check the
   \`logs\` field in the response for model-side errors.

## Notes

- Always use \`--json\` so output is machine-readable.
- Run \`genmedia pricing <endpoint_id> --json\` first if cost is a concern.
- If unsure which model to pick, run \`genmedia docs "<task>" --json\` for
  guidance from fal.ai documentation.
`;
