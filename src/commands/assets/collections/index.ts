import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "collections",
    description: "Manage asset collections (manual and smart)",
  },
  subCommands: {
    list: () => import("./list").then((m) => m.default),
    create: () => import("./create").then((m) => m.default),
    get: () => import("./get").then((m) => m.default),
    update: () => import("./update").then((m) => m.default),
    delete: () => import("./delete").then((m) => m.default),
    favorite: () => import("./favorite").then((m) => m.default),
    unfavorite: () => import("./unfavorite").then((m) => m.default),
    browse: () => import("./browse").then((m) => m.default),
    add: () => import("./add").then((m) => m.default),
    remove: () => import("./remove").then((m) => m.default),
  },
});
