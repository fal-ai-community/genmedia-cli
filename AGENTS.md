# genmedia CLI agent guide

## Scope

These instructions apply to the repository root unless a deeper `AGENTS.md` overrides them. The `web/` app has its own guidance in `web/AGENTS.md`.

## Repository shape

- `src/index.ts` is the CLI entrypoint and lazy-loads subcommands.
- `src/commands/` contains one file per command or command group.
- `src/lib/` contains shared runtime helpers for config, API access, output, and UI.
- `skills/` contains bundled skills. `skills/index.json` is generated from those directories.
- `scripts/` contains build and maintenance scripts.
- `web/` is a separate app with additional rules.

## Working conventions

- Keep changes small and focused. Match the existing TypeScript + ESM style.
- Prefer updating shared helpers over duplicating logic across commands.
- Use `bun` for repo scripts and local execution. Do not introduce `npm` or `pnpm` workflows here unless the repo already requires them.
- Follow Biome formatting conventions already present in the codebase.

## CLI command conventions

- Define commands with `defineCommand` from `citty`.
- Register new top-level commands in `src/index.ts` using the existing lazy-import pattern.
- Put shared request or parsing logic in `src/lib/` when it is used by more than one command.
- Prefer descriptive argument names that match the public CLI surface.
- Preserve existing aliases and compatibility behavior unless the task explicitly changes them.

## Output and UX

- This CLI is agent-first: preserve structured JSON output for `--json` and non-TTY usage.
- Prefer `output()`, `outputRawJson()`, `error()`, `isJsonOutput()`, and related helpers from `src/lib/output.ts` instead of ad hoc `console.log` handling.
- Only write custom pretty-mode terminal output when the command needs a richer TTY presentation.
- Avoid adding interactive prompts to non-interactive commands.

## API and config

- Reuse helpers from `src/lib/api.ts`, `src/lib/config.ts`, and `src/lib/env.ts` instead of reimplementing headers, auth, or config loading.
- Keep environment-variable behavior documented and consistent with help text and README examples.
- When changing command behavior, update the JSON help schema in `src/index.ts` if the public interface changes.

## Skills

- Treat each directory in `skills/` as a published bundle.
- If you add or modify bundled skills, regenerate or verify `skills/index.json` with `bun run skills:index` or `bun run skills:index:check`.
- Keep skill names, descriptions, and directory names in sync with `SKILL.md` frontmatter.

## Validation

- Prefer the smallest useful validation first.
- Common checks:
  - `bun run typecheck`
  - `bun run check`
  - `bun run build`
  - `bun run skills:index:check` when touching `skills/`
- Run broader build validation when changing packaging, generated artifacts, or command registration.

## Documentation

- Update `README.md` when adding commands, flags, environment variables, install behavior, or agent workflow changes.
- Keep examples aligned with the actual CLI output and command names.
