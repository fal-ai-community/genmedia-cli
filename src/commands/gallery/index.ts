import { defineCommand } from "citty";

// citty quirk: a parent command's `run` fires *in addition to* the matched
// subcommand's run. Using `default: "info"` plus only `subCommands` is the
// supported way to have a sensible behavior for the bare `genmedia gallery`
// command without double-printing.
export default defineCommand({
  meta: {
    name: "gallery",
    description:
      "Show or manage per-session HTML galleries of generated assets (file:// URL, no server)",
  },
  default: "info",
  subCommands: {
    info: () => import("./info").then((m) => m.default),
    open: () => import("./open").then((m) => m.default),
    list: () => import("./list").then((m) => m.default),
    clear: () => import("./clear").then((m) => m.default),
  },
});
