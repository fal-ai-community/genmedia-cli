import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/",
          destination: "https://genmedia-sh.fal.ai/",
        },
        {
          source: "/:path*",
          destination: "https://genmedia-sh.fal.ai/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
