import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "assets",
    description: "Browse, upload, and manage fal Assets",
  },
  subCommands: {
    browse: () => import("./browse").then((m) => m.default),
    get: () => import("./get").then((m) => m.default),
    upload: () => import("./upload").then((m) => m.default),
    update: () => import("./update").then((m) => m.default),
    delete: () => import("./delete").then((m) => m.default),
    favorite: () => import("./favorite").then((m) => m.default),
    unfavorite: () => import("./unfavorite").then((m) => m.default),
    tags: () => import("./tags/index").then((m) => m.default),
    collections: () => import("./collections/index").then((m) => m.default),
    characters: () => import("./characters/index").then((m) => m.default),
  },
});
