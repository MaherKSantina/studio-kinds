import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// A static page: everything runs in the browser, nothing is fetched or sent.
// The validate endpoint lives in functions/ and is deployed beside dist/ by
// Cloudflare Pages; the page itself never calls it. Relative asset paths, so
// the build also opens from a file and from a sub-path.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // One React for the page and the kits (workspace packages resolve to the same copy; this only insures it).
  resolve: { dedupe: ["react", "react-dom", "@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"] },
  build: { outDir: "dist", sourcemap: false },
  test: { environment: "node" },
});
