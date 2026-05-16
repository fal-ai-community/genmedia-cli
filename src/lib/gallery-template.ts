// Pure HTML renderer for the genmedia gallery. NO I/O at request time, no
// `process`/`fs` access. The actual HTML / CSS / JS lives in
// `./gallery-assets/` as editable .html / .css / .js files; we just splice
// page-specific data into a Mustache-style template at call time.
//
// Bun embeds the files as string constants via `with { type: "text" }`, so
// the compiled binary still ships a single self-contained executable.

// The HTML templates intentionally use the `.html.tmpl` extension: Bun's
// build pipeline applies its HTML loader to any `*.html` file in the
// import graph and strips `{{{...}}}` braces inside `<script>` blocks
// (parsing them as broken JS) even with `with { type: "text" }`. A
// non-`.html` extension keeps Bun's HTML loader out of the way so the
// templater can see the raw placeholders.
import indexScript from "./gallery-assets/index.client.js" with {
  type: "text",
};
import indexCss from "./gallery-assets/index.css" with { type: "text" };
import indexHtml from "./gallery-assets/index.html.tmpl" with { type: "text" };
import sessionScript from "./gallery-assets/session.client.js" with {
  type: "text",
};
import sessionCss from "./gallery-assets/session.css" with { type: "text" };
import sessionHtml from "./gallery-assets/session.html.tmpl" with {
  type: "text",
};
import sharedScript from "./gallery-assets/shared.client.js" with {
  type: "text",
};
import sharedStyles from "./gallery-assets/styles.css" with { type: "text" };
import { VERSION } from "./version";

// fal.ai brand icon (the leaf/asterisk mark only — extracted from the
// full wordmark in apps/web/src/components/base/logo.tsx). Color is
// inherited from the surrounding text via `currentColor`. We pair this
// with a separate "powered by fal.ai" link in the title row, so the
// brand chrome shrinks down to one tight line.
const FAL_ICON = `<svg class="fal-mark-icon" viewBox="0 0 47 48" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M30.1574 0.740479C30.9676 0.740479 31.6169 1.39923 31.6944 2.20567C32.3853 9.39891 38.1102 15.1234 45.3039 15.8142C46.1104 15.8917 46.7692 16.541 46.7692 17.3511V30.8959C46.7692 31.706 46.1104 32.3553 45.3039 32.4328C38.1102 33.1236 32.3853 38.8481 31.6944 46.0414C31.6169 46.8478 30.9676 47.5065 30.1574 47.5065H16.6118C15.8016 47.5065 15.1523 46.8478 15.0748 46.0414C14.384 38.8481 8.65901 33.1236 1.46528 32.4328C0.658799 32.3553 0 31.706 0 30.8959V17.3511C0 16.541 0.658803 15.8917 1.46529 15.8142C8.65902 15.1234 14.384 9.39891 15.0748 2.20567C15.1523 1.39923 15.8016 0.740479 16.6118 0.740479H30.1574ZM9.39037 24.0839C9.39037 31.865 15.6915 38.1728 23.4644 38.1728C31.2373 38.1728 37.5385 31.865 37.5385 24.0839C37.5385 16.3028 31.2373 9.99498 23.4644 9.99498C15.6915 9.99498 9.39037 16.3028 9.39037 24.0839Z"/></svg>`;

export type AssetKind = "image" | "video" | "audio" | "model" | "other";

export interface GalleryFile {
  path: string | null;
  url: string;
  size_bytes: number | null;
  kind: AssetKind;
  json_path: string;
}

export interface RunRecord {
  ts: number;
  request_id: string;
  endpoint_id: string;
  modality: string | null;
  prompt: string | null;
  duration_ms: number | null;
  files: GalleryFile[];
}

export interface SessionPayload {
  schema_version: 1;
  session_id: string;
  session_source: string;
  agent: string | null;
  agent_host: string | null;
  cwd: string | null;
  started_at: number;
  updated_at: number;
  // Optional user-set display name. Cosmetic only — the on-disk id stays
  // anchored to the process-tree resolver so future runs still land here.
  label?: string;
  runs: RunRecord[];
}

// image/video render real media; audio shows a synthetic waveform.
// 3d/other are skipped — no meaningful compact thumbnail.
export interface SessionPreview {
  kind: "image" | "video" | "audio";
  file: string | null;
  url: string;
}

export interface SessionSummary {
  session_id: string;
  label: string | null;
  agent: string | null;
  agent_host: string | null;
  started_at: number;
  updated_at: number;
  run_count: number;
  asset_count: number;
  kind_counts: Record<AssetKind, number>;
  modalities: string[];
  previews: SessionPreview[];
}

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

// Escapes a JSON string so it can be embedded inside <script>...</script>
// without breaking out of the tag. `</script>` is the only sequence that
// matters; `<!--` is escaped for good measure.
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("</", "<\\/")
    .replaceAll("<!--", "<\\u0021--");
}

// Tiny Mustache-style templater. Two forms only:
//   - `{{key}}`   — HTML-escaped substitution
//   - `{{{key}}}` — raw substitution
// Unknown keys are removed (so leftover placeholders never reach the user).
// Substitution is a single pass — inserted strings are never re-scanned, so
// values that happen to contain `{{…}}` make it through verbatim.
const TEMPLATE_RE = /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g;

export function applyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    TEMPLATE_RE,
    (_match, rawKey: string | undefined, escKey: string | undefined) => {
      if (rawKey !== undefined) {
        return Object.hasOwn(vars, rawKey) ? vars[rawKey] : "";
      }
      const key = escKey as string;
      return Object.hasOwn(vars, key) ? escapeHtml(vars[key]) : "";
    },
  );
}

export function renderSessionHtml(payload: SessionPayload): string {
  return applyTemplate(sessionHtml, {
    title: `genmedia session ${payload.session_id}`,
    styles: `${sharedStyles}\n${sessionCss}`,
    shared_script: sharedScript,
    page_script: sessionScript,
    data: safeJson(payload),
    version: VERSION,
    fal_icon: FAL_ICON,
  });
}

export function renderSessionsIndexHtml(sessions: SessionSummary[]): string {
  return applyTemplate(indexHtml, {
    styles: `${sharedStyles}\n${indexCss}`,
    shared_script: sharedScript,
    page_script: indexScript,
    data: safeJson({ schema_version: 1 as const, sessions }),
    version: VERSION,
    fal_icon: FAL_ICON,
  });
}
