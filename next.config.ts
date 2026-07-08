import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Tunnel uses rotating *.trycloudflare.com hosts during local
  // testing. Without this, Next dev mode can serve the HTML but block the
  // client JS/HMR/font requests, which makes buttons appear to do nothing.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // These packages use Node-specific features (worker files, fs font loading)
  // and must be required natively rather than bundled into the server build.
  serverExternalPackages: ["pdf-parse", "playwright"],
};

export default nextConfig;
