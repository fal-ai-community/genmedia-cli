import { secureFetch } from "../src/lib/tls";

const certificateErrors = new Set([
  "CERT_REVOKED",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
]);

async function main() {
  for (const [url, expected] of [
    ["https://example.com/", false],
    ["https://dv-g3b-emudhra.we-have-a-problem.com/", true],
    ["https://dv-g3b-aaa-emudhra.we-have-a-problem.com/", true],
  ] as const) {
    let rejected = false;
    try {
      const response = await secureFetch(url, {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(`Unexpected HTTP ${response.status} for ${url}`);
      await response.arrayBuffer();
    } catch (error) {
      if (!certificateErrors.has((error as { code?: string }).code ?? ""))
        throw error;
      rejected = true;
    }
    console.log(JSON.stringify({ runtime: Bun.version, url, rejected }));
    if (rejected !== expected)
      throw new Error(`Unexpected TLS result for ${url}`);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
