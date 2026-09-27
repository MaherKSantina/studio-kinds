import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// A static page: everything runs in the browser, nothing is fetched or sent. Relative asset paths,
// so the build also opens from a file and from a sub-path.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // One React (and one MUI) for the page and the kits: the workspace packages resolve to the same copy.
  resolve: { dedupe: ["react", "react-dom", "@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"] },
  build: { outDir: "dist", sourcemap: false },
  server: {
    port: 9270,
    // Fail loudly if the port is taken rather than sliding to another one.
    strictPort: true,
  },
  test: { environment: "node" },
});
