# genmedia

Agent-first CLI for fal.ai — search, run, and manage 1200+ model endpoints.

Works great for humans in a terminal and equally well for AI agents via shell commands. In a TTY, commands display a lightweight pretty view; when piped or called with `--json`, they emit structured JSON. No MCP required.

## Install

For Linux and macOS:

```bash
curl https://genmedia.sh/install -fsS | bash
```

For Windows:

```bash
irm https://genmedia.sh/install.ps1 | iex
```

## Setup

```bash
genmedia setup
```

The interactive wizard first asks how you want to authenticate:

- **Sign in with fal.ai (recommended)** — opens your browser and signs you in to your fal.ai account via WorkOS. The session is stored encrypted in `~/.genmedia/config.json` and is refreshed automatically.
- **Use an API key** — paste a key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys). Saved encrypted, or skip saving and use `FAL_KEY` in your environment.
- **Skip for now** — configure later or rely on `FAL_KEY` at runtime.

It then configures:

- **Auto-load `.env`** — automatically load `FAL_KEY` and related vars from a project `.env` file
- **Output mode** — `auto` (pretty in TTY, JSON when piped), `json` (always structured), or `standard` (always human-readable)
- **Automatic updates** — check for new versions in the background and swap in on next launch (default: on; set `GENMEDIA_NO_UPDATE=1` to disable)

To skip the wizard entirely, run `genmedia auth login` for browser sign-in, or set the key in your environment:

```bash
export FAL_KEY=your_fal_api_key
```

### `auth` — Sign in with your fal.ai account

```bash
genmedia auth login                       # open the browser to sign in
genmedia auth login --force               # re-authenticate even if a session exists
genmedia auth login --connection github   # skip the provider picker, go straight to GitHub
genmedia auth status                      # show current auth source, user, and expiry
genmedia auth status --verify             # also verify the token against the auth provider
genmedia auth logout                      # clear the local session
genmedia auth logout --revoke             # also revoke the refresh token server-side
```

Sign-in uses the OAuth 2.0 device-authorization grant against `auth.fal.ai`: the CLI prints a verification code, opens your browser, and you confirm the code on the activation page. Works over SSH and headless terminals — the URL and code are also printed to stdout so you can copy-paste them manually. With `--connection`, the CLI hops through fal.ai's session-seed endpoint to skip the provider picker and auto-confirm if you already have an active session.

| Env var | Description |
|---|---|
| `FAL_AUTH_DEBUG=1` | Print debug logs from the auth flow. Works in every build. |
| `FAL_AUTH_DOMAIN` | **Dev builds only.** Override the Auth0 issuer (default: `https://auth.fal.ai`). Ignored in the released binary. |
| `FAL_AUTH_CLIENT_ID` | **Dev builds only.** Override the Auth0 client_id. Ignored in the released binary. |
| `FAL_AUTH_AUDIENCE` | **Dev builds only.** Override the Auth0 API audience. Ignored in the released binary. |
| `FAL_BASE_URL` | **Dev builds only.** Override the fal.ai base URL used for session-seed (e.g. `http://localhost:3000`). Ignored in the released binary. |

The "dev builds only" variables are honored when running from source (`bun run dev`) and are ignored in the compiled binary distributed via `genmedia.sh/install`. This stops a hostile environment from redirecting the sign-in flow to a malicious host. To test against a local webapp, run `FAL_BASE_URL=http://localhost:3000 bun run dev auth login`.

**Auth precedence** for outgoing API calls:

1. `FAL_KEY` environment variable (always wins)
2. WorkOS session created by `auth login` (refreshed automatically)
3. API key saved by `setup`

### Non-interactive setup (agents / CI)

```bash
genmedia setup --non-interactive --api-key "$FAL_KEY"
genmedia setup --non-interactive --output-format json --no-auto-load-env --auto-update
```

Every flag is optional — fields you don't pass keep their current values, so repeated invocations are idempotent. Browser sign-in cannot run non-interactively; set `FAL_KEY` or pass `--api-key` instead.

| Flag | Description |
|---|---|
| `--non-interactive`, `-y` | Skip all prompts. Required when there is no TTY. |
| `--auth-mode <session\|key\|skip>` | Preferred auth mode. `session` prints instructions to run `genmedia auth login` separately. |
| `--api-key <key>` | API key to save. Pass `""` to clear the saved key. |
| `--no-save-key` | With `--api-key`, don't persist the key to `config.json` (use `FAL_KEY` at runtime instead). |
| `--output-format <auto\|json\|standard>` | Default output mode. |
| `--auto-load-env` / `--no-auto-load-env` | Toggle auto-loading `FAL_KEY` from a project `.env`. |
| `--auto-update` / `--no-auto-update` | Toggle background update checks. |

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
genmedia run fal-ai/flux/dev --prompt "a cat" --download                               # save to cwd with source file names
genmedia run fal-ai/flux/dev --prompt "a cat" --num_images 3 --download "./out/{index}.{ext}"
genmedia run fal-ai/flux/dev --help    # introspect model inputs as CLI help
```

Any model input parameter can be passed as a `--flag value` pair. Run `genmedia run <endpoint_id> --help` to see a model's accepted parameters rendered as CLI flags, or `genmedia schema <endpoint_id>` for the same info as structured JSON.

| Option | Description |
|---|---|
| `--<param>` | Any model input parameter (e.g. `--prompt`, `--num_images`) |
| `--logs` | Stream logs while the model runs (pretty terminal mode only) |
| `--async` | Submit to queue without waiting — returns a `request_id` |
| `--download [template]` | Download every media URL in the result. Optional value is a path or filename template with `{index}`, `{name}`, `{ext}`, `{request_id}` placeholders. Omitted → cwd with source file names. Trailing `/` or an existing directory → dir + source file names. Plain filename with multiple outputs → `_1`, `_2` suffixes on collision. Downloaded paths appear in JSON output under `downloaded_files`. |

### `status` — Check an async job

```bash
genmedia status fal-ai/veo3.1 <request_id>
genmedia status fal-ai/veo3.1 <request_id> --result
genmedia status fal-ai/veo3.1 <request_id> --logs
genmedia status fal-ai/veo3.1 <request_id> --cancel
genmedia status fal-ai/veo3.1 <request_id> --download ./out/   # implies --result
```

| Option | Description |
|---|---|
| `--result` | Fetch the completed result |
| `--logs` | Show logs verbosely |
| `--cancel` | Cancel the queued job |
| `--download [template]` | Same as on `run`. Implies `--result` — fetches the completed result and writes media files to disk. |

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

Shows the current version and flags any known update (populated by the background checker).

### `update` — Check for and apply updates

```bash
genmedia update              # download and swap in the latest release
genmedia update --check      # only check, don't download
genmedia update --force      # reinstall even if already on the latest
```

| Option | Description |
|---|---|
| `--check` | Only check for a newer version; don't download |
| `--force` | Re-download and reinstall even if already on the latest |

When automatic updates are enabled (default), every TTY invocation may trigger a rate-limited (1/hour) background check that stages the next release. The next `genmedia` launch atomically swaps it in. Set `GENMEDIA_NO_UPDATE=1` to disable all background checks; the manual `update` command still works.

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

The bundle is installed into `.agents/skills/` if the project has a `.agents/` directory, otherwise into `.claude/skills/`. If neither directory exists, the command exits with a message asking you to create one and try again.

After running `init`, compatible agent sessions in that project can use the installed skills without needing to call `--help`. Commit the installed skills directory so teammates and other agents get the same context.

### `skills` — Manage installed agent skills

```bash
genmedia skills list                  # list everything in the registry
genmedia skills list image            # full-text search name + description
genmedia skills install genmedia
genmedia skills update
genmedia skills remove genmedia
```

Installs, updates, lists, and removes agent skills from the genmedia registry. `skills list <query>` runs full-text search via the hosted index API (`GENMEDIA_SKILLS_API_URL`, default `https://genmedia.sh/skills`); the no-query form fetches `index.json` directly from the registry.

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
