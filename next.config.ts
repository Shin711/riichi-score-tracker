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
  // `sharp` is a native module and must not be bundled either.
  serverExternalPackages: ["ws", "riichi-rs-node", "sharp"],
  // Keeping the packages external is not enough on its own. The wasm file and
  // the tile PNGs are both loaded through computed paths, which file tracing
  // does not always see, so the functions would deploy without them.
  outputFileTracingIncludes: {
    "/api/cron/quiz-post": [
      "./node_modules/riichi-rs-node/**",
      "./src/assets/tiles/**",
    ],
    "/api/cron/quiz-reveal": [
      "./node_modules/riichi-rs-node/**",
      "./src/assets/tiles/**",
    ],
    "/api/discord/interactions": ["./node_modules/riichi-rs-node/**"],
  },
};

export default nextConfig;
