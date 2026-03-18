# falgen

Agent-first CLI for fal.ai — search, run, and manage 600+ generative AI models.

Works great for humans in a terminal and equally well for AI agents via shell commands. In a TTY, commands display a lightweight pretty view; when piped or called with `--json`, they emit structured JSON. No MCP required.

## Install

```bash
npx falgen --help
```

Or install globally:

```bash
curl https://falgen.sh/install -fsS | bash
```

## Setup

```bash
falgen setup
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

### `search` — Find models

```bash
falgen search "text to video"
falgen search "image upscaler" --category image-to-image
falgen search --category text-to-speech --limit 5
falgen search "flux" --status all          # include deprecated
falgen search "flux" --cursor <token>      # next page
```

| Option | Description |
|---|---|
| `--category` | Filter by category (e.g. `text-to-image`, `image-to-video`, `text-to-speech`) |
| `--status` | `active` (default), `deprecated`, or `all` |
| `--limit` | Max results (default: 20) |
| `--cursor` | Pagination cursor from a previous response |

### `models` — List and inspect models

```bash
falgen models "flux"
falgen models --category text-to-video
falgen models --endpoint_id fal-ai/flux/dev,fal-ai/flux/schnell
falgen models --endpoint_id fal-ai/flux/dev --expand openapi-3.0
```

More powerful than `search` — supports fetching specific endpoints by ID and expanding additional fields like the full OpenAPI schema.

| Option | Description |
|---|---|
| `--category` | Filter by category |
| `--status` | `active` (default), `deprecated`, or `all` |
| `--limit` | Max results (default: 20) |
| `--cursor` | Pagination cursor |
| `--endpoint_id` | Specific endpoint ID(s), comma-separated or repeated |
| `--expand` | Expand fields: `openapi-3.0`, `enterprise_status` |

### `schema` — Inspect model inputs/outputs

```bash
falgen schema fal-ai/flux/dev
falgen schema fal-ai/flux/dev --format openapi
```

| Option | Description |
|---|---|
| `--format` | `compact` (default) or `openapi` — returns full OpenAPI JSON |

### `run` — Run a model

```bash
falgen run fal-ai/flux/dev --prompt "a cat on the moon"
falgen run fal-ai/flux/dev --prompt "a cat" --num_images 2
falgen run fal-ai/flux/dev --prompt "a cat" --logs
falgen run fal-ai/veo3.1 --prompt "a dog running" --async
```

Any model input parameter can be passed as a `--flag value` pair. `falgen schema <endpoint_id>` shows what parameters a model accepts.

| Option | Description |
|---|---|
| `--<param>` | Any model input parameter (e.g. `--prompt`, `--num_images`) |
| `--logs` | Stream logs while the model runs (pretty terminal mode only) |
| `--async` | Submit to queue without waiting — returns a `request_id` |

### `status` — Check an async job

```bash
falgen status fal-ai/veo3.1 <request_id>
falgen status fal-ai/veo3.1 <request_id> --result
falgen status fal-ai/veo3.1 <request_id> --logs
falgen status fal-ai/veo3.1 <request_id> --cancel
```

| Option | Description |
|---|---|
| `--result` | Fetch the completed result |
| `--logs` | Show logs verbosely |
| `--cancel` | Cancel the queued job |

### `upload` — Upload files to fal.ai CDN

```bash
falgen upload ./photo.jpg
falgen upload https://example.com/image.png
```

Accepts a local file path or a remote URL. Returns a CDN URL you can use as model input.

### `pricing` — Check model pricing

```bash
falgen pricing fal-ai/flux/dev
```

### `docs` — Search documentation

```bash
falgen docs "how to use LoRA"
falgen docs "webhook callbacks"
```

Searches fal.ai documentation, guides, and API references.

### `version` — Show version

```bash
falgen version
```

Shows the current version and checks for updates.

## Agent-first design

All commands output structured JSON when piped or called with `--json`:

```bash
falgen run fal-ai/flux/dev --prompt "a cat" --json
falgen search "text to video" | jq '.[]'
```

To get a machine-readable description of all commands for use in a system prompt or agent context:

```bash
falgen --help --json
```

This returns a full schema of every command, its arguments, and options. Agents that don't support MCP (Codex, Gemini CLI, etc.) can use fal.ai through `falgen` via standard shell commands.

## License

MIT
