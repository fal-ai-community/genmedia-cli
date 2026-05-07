import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "auth",
    description:
      "Sign in to your fal.ai account, sign out, or check session status",
  },
  subCommands: {
    login: () => import("./login").then((m) => m.default),
    logout: () => import("./logout").then((m) => m.default),
    status: () => import("./status").then((m) => m.default),
  },
});
