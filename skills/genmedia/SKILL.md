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

5. **Return** the result to the user. If the result contains URLs (images,
   video, audio), present them clearly. If something failed, check the
   `logs` field in the response for model-side errors.

## Notes

- Always use `--json` so output is machine-readable.
- Run `genmedia pricing <endpoint_id> --json` first if cost is a concern.
- If unsure which model to pick, run `genmedia docs "<task>" --json` for
  guidance from fal.ai documentation.
