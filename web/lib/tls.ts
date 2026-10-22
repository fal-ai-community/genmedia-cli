import { X509Certificate } from "node:crypto";
import * as tls from "node:tls";

const distrusted = new Set([
  "86A1ECBA089C4A8D3BBE2734C612BA341D813E043CF9E8A862CD5C57A36BBE6B",
  "D7A7A0FB5D7E2731D771E9484EBCDEF71D5F0C3E0A2948782BC83EE0EA699EF4",
  "125609AA301DA0A249B97A8239CB6A34216F44DCAC9F3954B14292F2E8C8608F",
  "BC4D809B15189D78DB3E1D8CF4F9726A795DA1643CA5F1358E1DDB0EDC0D7EB3",
]);

type CertificateAPI = typeof tls & {
  getCACertificates(type: "default"): string[];
  setDefaultCACertificates(certificates: string[]): void;
};

export function configureCertificateTrust(): void {
  const api = tls as CertificateAPI;
  if (!api.getCACertificates || !api.setDefaultCACertificates) {
    throw new Error(
      "The web server requires a supported Node 22 runtime with certificate-store APIs",
    );
  }
  const current = api.getCACertificates("default");
  const clean = current.filter(
    (pem) =>
      !distrusted.has(
        new X509Certificate(pem).fingerprint256.replaceAll(":", ""),
      ),
  );
  if (clean.length !== current.length) api.setDefaultCACertificates(clean);
  console.info(
    `[tls] Node ${process.version}; removed ${current.length - clean.length} distrusted roots`,
  );
}
