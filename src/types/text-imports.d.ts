// Allows `import text from "./path" with { type: "text" }` for assets the
// Bun bundler should embed verbatim. Bun reads these from disk in dev and
// inlines them as string constants at `bun build --compile` time.
//
// The HTML gallery templates are named `*.html.tmpl` (not `*.html`) on
// purpose: Bun's HTML loader otherwise runs on `*.html` files in the
// import graph and corrupts `{{{...}}}` template placeholders inside
// `<script>` blocks (see comment in gallery-template.ts).
declare module "*.css" {
  const content: string;
  export default content;
}
declare module "*.client.js" {
  const content: string;
  export default content;
}
declare module "*.html.tmpl" {
  const content: string;
  export default content;
}
