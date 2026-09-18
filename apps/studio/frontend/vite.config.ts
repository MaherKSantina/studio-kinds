import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// One React for the app and the kits (workspace packages resolve to the same copy; this only insures it).
const dedupe = ["react", "react-dom"];

export default defineConfig(({ mode }) => {
  // THE DESKTOP RENDERER: the desktop entry alone, relative asset paths (the shell loads it from
  // disk), built straight into apps/desktop/renderer. No proxies — the shell IS the store.
  if (mode === "desktop") {
    return {
      base: "./",
      plugins: [react(), tailwindcss()],
      resolve: { dedupe },
      build: {
        outDir: "../../desktop/renderer",
        emptyOutDir: true,
        rollupOptions: { input: "desktop.html" },
      },
    };
  }
  // THE VS CODE WEBVIEW: one document's surface, built into the extension's media folder. The
  // extension re-bases the relative asset paths onto webview URIs when it serves the page.
  if (mode === "vscode") {
    return {
      base: "./",
      plugins: [react(), tailwindcss()],
      resolve: { dedupe },
      build: {
        outDir: "../../vscode/media",
        emptyOutDir: true,
        rollupOptions: { input: "vscode.html" },
      },
    };
  }
  return {
    // Served under /studio/ everywhere (locally and behind suite-router), so the
    // public hostname can mount it next to the other tools without path surgery.
    base: "/studio/",
    plugins: [react(), tailwindcss()],
    resolve: { dedupe },
    // Two pages: the drive (index.html) and a folder on disk through the folder worker (folder.html).
    build: { rollupOptions: { input: { index: "index.html", folder: "folder.html" } } },
    server: {
      port: 9260,
      // Fail LOUDLY if the port is taken. Silently sliding to port+2 is how a
      // service ends up "running" where the router cannot find it.
      strictPort: true,
      host: true,
      // Reached through suite-router behind the public hostname; Vite blocks
      // unknown Host headers by default.
      allowedHosts: ["orchestration-digitalsymphony.ngrok.pizza"],
      proxy: {
        // The suite's ask worker: /studio/ask-api/* -> :9250/*
        "/studio/ask-api": {
          target: "http://127.0.0.1:9250",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/studio\/ask-api/, ""),
        },
        // Shared file system: /studio/nodes-api/* -> :9111/*
        "/studio/nodes-api": {
          target: "http://127.0.0.1:9111",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/studio\/nodes-api/, ""),
        },
        // A folder on disk (folder.html): /studio/folder-api/* -> :9112/*
        "/studio/folder-api": {
          target: "http://127.0.0.1:9112",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/studio\/folder-api/, ""),
        },
      },
    },
  };
});
