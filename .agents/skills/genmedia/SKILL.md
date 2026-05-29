---
name: genmedia
description: >
  Run a fal.ai model end-to-end with the genmedia CLI. Use this when the user
  asks to generate an image, video, or audio; convert media; upscale or
  restyle; run any fal.ai model; or "use genmedia" for a task. Guides
  discovery, schema inspection, input preparation, execution, and result
  handling.
---

# genmedia workflow

Use this skill when the user wants to execute a fal.ai model — either by
task description (e.g. "generate a video of a dog running") or by a specific
`endpoint_id` (e.g. `fal-ai/flux/dev`). Load `genmedia-ref` alongside this
skill for the full command reference.

## Steps

1. **Discover** — If no endpoint_id is given, search for a suitable model:
   ```
   genmedia models "<task>" --json
   ```

2. **Inspect** — Get the model's input parameters:
   ```
   genmedia schema <endpoint_id> --json
   ```
   Read all required fields before running.

3. **Upload files** (if inputs include images/video/audio):
   ```
   genmedia upload <local_file_or_url> --json
   ```
   Use the returned `url` as the parameter value.

4. **Run** the model:
   - Fast model (completes in seconds):
     ```
     genmedia run <endpoint_id> --<param> <value> ... --json
     ```
   - Slow model (video generation, large jobs):
     ```
     genmedia run <endpoint_id> --<param> <value> ... --async --json
     genmedia status <endpoint_id> <request_id> --result --json
     ```

5. **Save outputs** — when the user expects files on disk, add `--download`
   to `run` or `status`. The CLI writes every media URL from the result to
   the filesystem and returns the local paths in `downloaded_files[]`. Do
   **not** `curl` the URLs yourself; use the flag.
   ```
   genmedia run fal-ai/flux/dev --prompt "a cat" --download --json                            # cwd, source file names
   genmedia run fal-ai/flux/dev --prompt "a cat" --num_images 3 --download "./out/{index}.{ext}" --json
   genmedia status <endpoint_id> <request_id> --download ./out/ --json                        # implies --result
   ```
   Use `{index}`, `{name}`, `{ext}`, `{request_id}` placeholders in the
   template when the model returns multiple files (`images[]`,
   `image_urls[]`, etc.) to avoid filename collisions. A trailing `/` or
   an existing directory path saves files under that directory using their
   source names.

6. **Return** the result to the user. If `--download` was used, reference
   the paths from `downloaded_files[]`; otherwise present the URLs from
   `result` clearly.

## Assets library (`genmedia assets ...`)

The fal Assets API lets you persist generated media, organize it into
collections, and define reusable characters.

### Two ways to identify an asset

- **`vector_id`** — present for any media in the user's library or in a
  semantic-search result. Returned by `assets browse` / `assets get` /
  `assets upload`. Used both as a flag on mutations and as the positional
  argument for `assets get` and `assets tags for-asset`.
- **`request_id`** — the generation the user just ran. Returned by
  `genmedia run` and `genmedia status`.

**Which to pass.** Use `--vector_id` if you have it (anything in the
library or a search result has one); otherwise use `--request_id` for a
fresh generation.

Use these flags on every command that takes an asset target:
`assets favorite`, `assets unfavorite`, `assets tags assign / unassign / set`,
`assets collections add / remove`, `assets characters create
--reference_image <id>`.

### `assets upload` is for external media only

Use `assets upload` only for **local files or non-fal URLs** — media that
isn't already in fal's system. For anything that came out of a
`genmedia run`, use the `request_id` instead.

### Cheatsheet

| What you have | Use |
|---|---|
| `vector_id` (from `assets browse` / `get` / `upload`) | `--vector_id <id>` |
| `request_id` (from `genmedia run` / `status`) | `--request_id <id>` |
| Local file or non-fal URL | `assets upload <path_or_url>` |

### Example — character from a fresh generation

```bash
RUN=$(genmedia run fal-ai/flux/schnell --prompt "an elegant black cat" --json)
REQ=$(echo "$RUN" | jq -r .request_id)

genmedia assets characters create "Whiskers" \
  --description "An elegant black cat sitting on a moss-covered rock" \
  --reference_image "$REQ" \
  --identifier whiskers \
  --json
```

Same pattern for `assets collections add --request_id <id>` and
`assets favorite --request_id <id>`. Newly-referenced media — whether by
`request_id` or by a `vector_id` from a fresh upload — may take a moment
to appear in `assets browse` / semantic search while the embedding
finishes.

For the full command tree, run `genmedia assets --help` or any subcommand
with `--help`.

## Handling errors

When a command exits non-zero, it prints a JSON error object to stderr:

```json
{
  "error": "Validation error — num_images: Input should be less than or equal to 4",
  "details": {
    "endpoint_id": "fal-ai/flux/schnell",
    "request_id": "019d...",
    "status": 422,
    "error_type": "ValidationError",
    "validation_errors": [
      { "field": "num_images", "message": "Input should be less than or equal to 4", "type": "less_than_equal", "input": 20 }
    ],
    "body": { "detail": [ ... raw FastAPI payload ... ] }
  }
}
```

- `status: 422` / `error_type: "ValidationError"` means the inputs violated
  the model schema. Read `details.validation_errors` — each entry names the
  `field`, a human `message`, the validator `type`, and the `input` that was
  rejected. Re-run `genmedia schema <endpoint_id> --json` if you need the
  allowed values, fix the offending args, and retry.
- Other statuses (401 auth, 403 forbidden, 404 endpoint not found, 429 rate
  limited, 5xx upstream) surface the server message directly in `error` and
  do not contain `validation_errors`. Do not retry 4xx errors blindly —
  correct the request first.
- For in-flight model failures, `details.logs` contains the most recent
  model-side log lines.

## Notes

- Always use `--json` so output is machine-readable.
- Run `genmedia pricing <endpoint_id> --json` first if cost is a concern.
- If unsure which model to pick, run `genmedia docs "<task>" --json` for
  guidance from fal.ai documentation.
