// Run with fixed Node 22.23.4. Bun's bundled root store remains affected.
import { writeFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

if (process.version !== "v22.23.4") {
  throw new Error("Regenerate this bundle with Node 22.23.4");
}
writeFileSync(
  new URL("../src/lib/public-ca-bundle.pem", import.meta.url),
  `${rootCertificates.join("\n")}\n`,
);
