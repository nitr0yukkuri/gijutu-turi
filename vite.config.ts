import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

const backendPort = process.env.BACKEND_PORT ?? (process.env.PORT === "8788" ? "8787" : process.env.PORT ?? "8787");
const backendHttp = `http://127.0.0.1:${backendPort}`;
const backendWs = `ws://127.0.0.1:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      three: resolve(process.cwd(), "vendor/three.module.js"),
    },
  },
  base: "./",
  publicDir: false,
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_PORT ?? 8788),
    strictPort: true,
    proxy: {
      "/api": { target: backendHttp, changeOrigin: true },
      "/health": { target: backendHttp, changeOrigin: true },
      "/ocean-ws": { target: backendWs, ws: true },
      "/ws": { target: backendWs, ws: true },
      "/manifest.webmanifest": { target: backendHttp },
      "/service-worker.js": { target: backendHttp },
      "/assets/gijutu-turi-logo.png": { target: backendHttp },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        goFish: resolve(process.cwd(), "go-fish.html"),
        dockerWhale: resolve(process.cwd(), "docker-whale.html"),
        serviceWorker: resolve(process.cwd(), "src/service-worker.ts"),
      },
      output: {
        entryFileNames: chunk => chunk.name === "main" ? "ocean-app.js" : chunk.name === "serviceWorker" ? "service-worker.js" : "assets/[name]-[hash].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: asset => asset.name?.endsWith(".css") ? "ocean.css" : asset.name?.endsWith(".webmanifest") ? "manifest.webmanifest" : "assets/[name]-[hash][extname]",
      },
    },
  },
});
