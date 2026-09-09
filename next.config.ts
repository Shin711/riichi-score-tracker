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
  //
  // `riichi-rs-node` reads its .wasm off disk relative to __dirname at import
  // time, which only works if the package stays unbundled in node_modules.
  serverExternalPackages: ["ws", "riichi-rs-node"],
  // Keeping the package external is not enough on its own: the wasm file is
  // loaded through a computed path, so file tracing does not always see it and
  // the function would deploy without it.
  outputFileTracingIncludes: {
    "/api/cron/quiz-post": ["./node_modules/riichi-rs-node/**"],
    "/api/cron/quiz-reveal": ["./node_modules/riichi-rs-node/**"],
    "/api/discord/interactions": ["./node_modules/riichi-rs-node/**"],
  },
};

export default nextConfig;
