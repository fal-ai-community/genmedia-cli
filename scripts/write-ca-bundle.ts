// Bootstrap package acquisition without downloading dependencies first.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { cleanCertificates } from "../src/lib/tls";
const filename = join(
  process.env.RUNNER_TEMP ?? tmpdir(),
  "genmedia-public-ca.pem",
);
writeFileSync(
  filename,
  cleanCertificates(rootCertificates.join("\n")).join("\n") + "\n",
);
process.stdout.write(filename);
