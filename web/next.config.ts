import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "https://fal.ai/docs/genmedia",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
