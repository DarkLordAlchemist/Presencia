import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides Next.js's own "N" developer badge (bottom-left, dev mode only) so
  // it isn't mistaken for part of Presencia during demos. Compile/runtime
  // errors still pop up when they happen.
  devIndicators: false,
};

export default nextConfig;
