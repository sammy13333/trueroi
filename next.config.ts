import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace browser may proxy localhost through either hostname.
  // Allow both in development so Next's HMR/assets are not rejected.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
