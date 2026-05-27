import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "characters",
    description: "Manage asset characters (named reference-image bundles)",
  },
  subCommands: {
    list: () => import("./list").then((m) => m.default),
    create: () => import("./create").then((m) => m.default),
    get: () => import("./get").then((m) => m.default),
    update: () => import("./update").then((m) => m.default),
    delete: () => import("./delete").then((m) => m.default),
    favorite: () => import("./favorite").then((m) => m.default),
    unfavorite: () => import("./unfavorite").then((m) => m.default),
  },
});
