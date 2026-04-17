import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "skills",
    description:
      "Install, update, and list agent skills from the genmedia registry",
  },
  subCommands: {
    list: () => import("./list").then((m) => m.default),
    install: () => import("./install").then((m) => m.default),
    update: () => import("./update").then((m) => m.default),
    remove: () => import("./remove").then((m) => m.default),
  },
});
