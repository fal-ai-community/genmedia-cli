import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { secureFetch } from "../src/lib/tls";

const [binaryArg, platform, version] = process.argv.slice(2);
if (!binaryArg || !platform || !version)
  throw new Error("Expected binary, platform, and version");
const binary = resolve(binaryArg);
const asset = `genmedia-${platform}${platform.startsWith("windows-") ? ".exe" : ""}`;
const checksums = await secureFetch(
  `https://github.com/fal-ai-community/genmedia-cli/releases/download/v${version}/checksums.txt`,
);
if (!checksums.ok) throw new Error(`Checksums: HTTP ${checksums.status}`);
const expected = (await checksums.text())
  .split("\n")
  .map((line) => line.trim().split(/\s+/))
  .find((parts) => parts[1] === asset)?.[0];
if (!expected) throw new Error(`No checksum for ${asset}`);
const actual = createHash("sha256")
  .update(await readFile(binary))
  .digest("hex");
if (actual !== expected)
  throw new Error(`Published checksum mismatch for ${asset}`);
console.log(`PASS public installer SHA-256 ${asset}: ${actual}`);

async function run(args: string[], extra: Record<string, string> = {}) {
  const child = Bun.spawn([binary, ...args], {
    env: {
      ...process.env,
      GENMEDIA_NO_UPDATE: "1",
      GENMEDIA_NO_ANALYTICS: "1",
      GENMEDIA_NO_GALLERY: "1",
      ...extra,
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}
const current = await run(["version"]);
if (current.code !== 0 || JSON.parse(current.stdout).version !== version)
  throw new Error(
    `Wrong installed version: ${current.stdout}${current.stderr}`,
  );
for (const url of [
  "https://dv-g3b-emudhra.we-have-a-problem.com/",
  "https://dv-g3b-aaa-emudhra.we-have-a-problem.com/",
]) {
  const result = await run(["skills", "list"], {
    GENMEDIA_SKILLS_API_URL: url,
  });
  if (
    result.code === 0 ||
    !/issuer certificate|certificate verify|CERT_/i.test(
      result.stdout + result.stderr,
    )
  )
    throw new Error(
      `Missing certificate rejection for ${url}: ${JSON.stringify(result)}`,
    );
  console.log(`PASS installed binary rejects certificate: ${url}`);
}
const good = await run(["skills", "list"]);
if (good.code !== 0 || JSON.parse(good.stdout).count < 1)
  throw new Error(`Normal registry failed: ${good.stdout}${good.stderr}`);
console.log("PASS installed binary fetches normal skills registry");
