# genmedia

Agent-first CLI for fal.ai — search, run, and manage 1200+ model endpoints.

Works great for humans in a terminal and equally well for AI agents via shell commands. In a TTY, commands display a lightweight pretty view; when piped or called with `--json`, they emit structured JSON. No MCP required.

## Install

```bash
npx genmedia --help
```

Or install globally:

```bash
curl https://genmedia.sh/install -fsS | bash
```

## Setup

```bash
genmedia setup
```

Interactive wizard that configures:

- **API key** — saved encrypted to your local config (or skip and use `FAL_KEY` in your environment)
- **Auto-load `.env`** — automatically load `FAL_KEY` and related vars from a project `.env` file
- **Output mode** — `auto` (pretty in TTY, JSON when piped), `json` (always structured), or `standard` (always human-readable)

Get your API key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

To skip the wizard, set the key in your environment:

```bash
export FAL_KEY=your_fal_api_key
```

## Commands

### `models` — Search and inspect models

```bash
genmedia models "text to video"
genmedia models "flux" --category text-to-image
genmedia models --category text-to-speech --limit 5
genmedia models --status all                                      # include deprecated
genmedia models --endpoint_id fal-ai/flux/dev,fal-ai/flux/schnell # fetch specific models
genmedia models --endpoint_id fal-ai/flux/dev --expand openapi-3.0
genmedia models "flux" --cursor <token>                           # next page
```

| Option | Description |
|---|---|
| `--category` | Filter by category (e.g. `text-to-image`, `image-to-video`, `text-to-speech`) |
| `--status` | `active` (default), `deprecated`, or `all` |
| `--limit` | Max results (default: 20) |
| `--cursor` | Pagination cursor from a previous response |
| `--endpoint_id` | Fetch specific model(s) by ID — comma-separated or repeated |
| `--expand` | Expand additional fields: `openapi-3.0`, `enterprise_status` |

### `schema` — Inspect model inputs/outputs

```bash
genmedia schema fal-ai/flux/dev
genmedia schema fal-ai/flux/dev --format openapi
```

| Option | Description |
|---|---|
| `--format` | `compact` (default) or `openapi` — returns full OpenAPI JSON |

### `run` — Run a model

```bash
genmedia run fal-ai/flux/dev --prompt "a cat on the moon"
genmedia run fal-ai/flux/dev --prompt "a cat" --num_images 2
genmedia run fal-ai/flux/dev --prompt "a cat" --logs
genmedia run fal-ai/veo3.1 --prompt "a dog running" --async
```

Any model input parameter can be passed as a `--flag value` pair. `genmedia schema <endpoint_id>` shows what parameters a model accepts.

| Option | Description |
|---|---|
| `--<param>` | Any model input parameter (e.g. `--prompt`, `--num_images`) |
| `--logs` | Stream logs while the model runs (pretty terminal mode only) |
| `--async` | Submit to queue without waiting — returns a `request_id` |

### `status` — Check an async job

```bash
genmedia status fal-ai/veo3.1 <request_id>
genmedia status fal-ai/veo3.1 <request_id> --result
genmedia status fal-ai/veo3.1 <request_id> --logs
genmedia status fal-ai/veo3.1 <request_id> --cancel
```

| Option | Description |
|---|---|
| `--result` | Fetch the completed result |
| `--logs` | Show logs verbosely |
| `--cancel` | Cancel the queued job |

### `upload` — Upload files to fal.ai CDN

```bash
genmedia upload ./photo.jpg
genmedia upload https://example.com/image.png
```

Accepts a local file path or a remote URL. Returns a CDN URL you can use as model input.

### `pricing` — Check model pricing

```bash
genmedia pricing fal-ai/flux/dev
```

### `docs` — Search documentation

```bash
genmedia docs "how to use LoRA"
genmedia docs "webhook callbacks"
```

Searches fal.ai documentation, guides, and API references.

### `version` — Show version

```bash
genmedia version
```

Shows the current version and checks for updates.

### `init` — Install the default genmedia skill bundle

```bash
genmedia init
genmedia init --force   # overwrite existing files
```

Installs the default genmedia skill bundle:

| Skill | Purpose |
|---|---|
| `genmedia-ref` | Background reference for fal.ai work |
| `genmedia` | Guided workflow for model discovery, schema inspection, and execution |

The bundle is installed into `.agents/skills/` in the current directory and linked into `.claude/skills/` by default.

After running `init`, compatible agent sessions in that project can use the installed skills without needing to call `--help`. Commit `.agents/` and the generated links so teammates and other agents get the same context.

### `skills` — Manage installed agent skills

```bash
genmedia skills list
genmedia skills install genmedia
genmedia skills update
genmedia skills remove genmedia
```

Installs, updates, lists, and removes agent skills from the genmedia registry.

## Agent-first design

All commands output structured JSON when piped or called with `--json`:

```bash
genmedia run fal-ai/flux/dev --prompt "a cat" --json
genmedia models "text to video" --json | jq '.models[]'
```

To get a machine-readable description of all commands for use in a system prompt or agent context:

```bash
genmedia --help --json
```

This returns a full schema of every command, its arguments, and options. Agents that don't support MCP (Codex, Gemini CLI, etc.) can use fal.ai through `genmedia` via standard shell commands.

## License

MIT
