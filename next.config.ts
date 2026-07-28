import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Parent folder has a stray package-lock.json; pin Turbopack to this app so
  // it doesn't scan all of C:\Users\XING\Projects (which stalls "Compiling /").
  turbopack: {
    root: path.join(__dirname),
  },
  // `ws` resolves optional native addons (bufferutil, utf-8-validate) at
  // runtime; bundling it breaks those requires. Keep it external on the server.
  serverExternalPackages: ["ws"],
};

export default nextConfig;
