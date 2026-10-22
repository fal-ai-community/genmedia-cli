export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { configureCertificateTrust } = await import("./lib/tls");
    configureCertificateTrust();
  }
}
