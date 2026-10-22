import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import publicRoots from "./public-ca-bundle.pem" with { type: "text" };

// https://emudhra.we-have-a-problem.com/roots.json
const DISTRUSTED = new Set([
  "86A1ECBA089C4A8D3BBE2734C612BA341D813E043CF9E8A862CD5C57A36BBE6B",
  "D7A7A0FB5D7E2731D771E9484EBCDEF71D5F0C3E0A2948782BC83EE0EA699EF4",
  "7DD78D5F4F13459A83DFF9ABBBA62EDBAF6F2D102BF257FD712F4D9F2746ED8D",
  "F2EDAAFF3D9B701FB4D14C9F285F8C0BAD90FC3BCC1FA07D47F4718EDABA34A5",
  "125609AA301DA0A249B97A8239CB6A34216F44DCAC9F3954B14292F2E8C8608F",
  "BC4D809B15189D78DB3E1D8CF4F9726A795DA1643CA5F1358E1DDB0EDC0D7EB3",
]);

export function cleanCertificates(pem: string): string[] {
  const certificates = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  if (!certificates)
    throw new Error("The configured CA file contains no PEM certificates");
  return certificates.filter((certificate) => {
    const fingerprint = new X509Certificate(
      certificate,
    ).fingerprint256.replaceAll(":", "");
    return !DISTRUSTED.has(fingerprint);
  });
}

let cached: { paths: string; certificates: string[] } | undefined;

function trustedCertificates(): string[] {
  // Preserve explicitly configured private CAs without re-enabling affected roots.
  // Resolve lazily so the CLI's opt-in .env loader runs before the first request.
  const paths = [
    process.env.NODE_EXTRA_CA_CERTS,
    process.env.SSL_CERT_FILE,
  ].filter((path): path is string => Boolean(path));
  const key = JSON.stringify(paths);
  if (cached?.paths === key) return cached.certificates;
  const certificates = cleanCertificates(publicRoots);
  for (const path of new Set(paths))
    certificates.push(...cleanCertificates(readFileSync(path, "utf8")));
  cached = { paths: key, certificates };
  return certificates;
}

/** Bun's `tls.ca` replaces its bundled roots for this request. */
async function request(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit & { tls?: Bun.TLSOptions },
): Promise<Response> {
  // Bun 1.3.11 still accepts G3 with tls.ca; 1.4.3 honors this override.
  if (!Bun.semver.satisfies(Bun.version, ">=1.4.3")) {
    throw new Error(
      "genmedia network access requires Bun 1.4.3 or newer; rebuild the CLI with the pinned runtime",
    );
  }
  let ca = trustedCertificates();
  if (init?.tls?.ca !== undefined) {
    const values = Array.isArray(init.tls.ca) ? init.tls.ca : [init.tls.ca];
    ca = [];
    for (const value of values) {
      const pem =
        typeof value === "string"
          ? value
          : value instanceof Blob
            ? await value.text()
            : ArrayBuffer.isView(value)
              ? Buffer.from(
                  value.buffer,
                  value.byteOffset,
                  value.byteLength,
                ).toString("utf8")
              : Buffer.from(value).toString("utf8");
      ca.push(...cleanCertificates(pem));
    }
    if (ca.length === 0)
      throw new Error(
        "The configured CA store contains only distrusted certificates",
      );
  }
  return fetch(input, {
    ...init,
    tls: {
      ...init?.tls,
      ca,
      rejectUnauthorized: true,
    },
  });
}

export const secureFetch = Object.assign(request, {
  // Bun's preconnect API cannot select a CA store. Leave connection creation
  // to the actual request, which always supplies the exclusive clean store.
  preconnect(..._args: Parameters<typeof fetch.preconnect>): void {},
}) satisfies typeof fetch;
