import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Hide the on-screen dev indicator (the "N" badge in the corner).
  devIndicators: false,
};

export default nextConfig;
