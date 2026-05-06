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
          destination: "https://gm-cli.webflow.io/",
        },
        {
          source: "/:path*",
          destination: "https://gm-cli.webflow.io/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
