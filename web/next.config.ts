import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server bundle keeps the Docker image small.
  output: "standalone",
  // No dev badge in the corner; it shows up in demo recordings.
  devIndicators: false,
};

export default nextConfig;
