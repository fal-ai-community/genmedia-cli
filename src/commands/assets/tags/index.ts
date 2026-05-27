import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "tags",
    description: "Manage asset tags (CRUD and per-asset assignment)",
  },
  subCommands: {
    list: () => import("./list").then((m) => m.default),
    create: () => import("./create").then((m) => m.default),
    update: () => import("./update").then((m) => m.default),
    delete: () => import("./delete").then((m) => m.default),
    "for-asset": () => import("./for-asset").then((m) => m.default),
    set: () => import("./set").then((m) => m.default),
    assign: () => import("./assign").then((m) => m.default),
    unassign: () => import("./unassign").then((m) => m.default),
  },
});
