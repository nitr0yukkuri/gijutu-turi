import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(root, "client"),
  plugins: [react()],
  resolve: {
    // R3F, the procedural fish, and the model preview must share one Three.js
    // module or Object3D/material identity checks become needlessly fragile.
    alias: { three: path.resolve(root, "vendor/three.module.js") },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ocean-ws": { target: "ws://127.0.0.1:8787", ws: true },
    },
  },
  build: {
    outDir: path.resolve(root, "dist/client"),
    emptyOutDir: true,
  },
});
