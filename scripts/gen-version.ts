import { VERSION } from "../src/lib/version";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
writeFileSync(
  "dist/version.json",
  JSON.stringify(
    { version: VERSION, built_at: new Date().toISOString() },
    null,
    2,
  ),
);
