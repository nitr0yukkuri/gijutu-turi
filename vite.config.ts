import { defineConfig } from "vite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import react from "@vitejs/plugin-react";
import { createPrecacheManifest } from "./src/precache-manifest.js";

const backendPort = process.env.BACKEND_PORT ?? (process.env.PORT === "8788" ? "8787" : process.env.PORT ?? "8787");
const backendHttp = `http://127.0.0.1:${backendPort}`;
const backendWs = `ws://127.0.0.1:${backendPort}`;
const publicOrigin = (process.env.VITE_PUBLIC_ORIGIN ?? "").trim().replace(/\/+$/, "");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-third-party-notices",
      transformIndexHtml(html) {
        return html.replaceAll("__OG_ORIGIN__", publicOrigin);
      },
      closeBundle() {
        const clientOutput = resolve(process.cwd(), "dist/client");
        copyFileSync(
          resolve(process.cwd(), "LICENSE"),
          resolve(process.cwd(), "dist/client/license.txt"),
        );
        copyFileSync(
          resolve(process.cwd(), "THIRD-PARTY-NOTICES.txt"),
          resolve(process.cwd(), "dist/client/third-party-notices.txt"),
        );
        mkdirSync(resolve(process.cwd(), "dist/client/assets"), { recursive: true });
        copyFileSync(
          resolve(process.cwd(), "assets/gijutu-turi-logo.png"),
          resolve(process.cwd(), "dist/client/assets/gijutu-turi-logo.png"),
        );
        copyFileSync(
          resolve(process.cwd(), "assets/gijutu-turi-favicon-generated.png"),
          resolve(process.cwd(), "dist/client/assets/gijutu-turi-favicon-generated.png"),
        );
        copyFileSync(
          resolve(process.cwd(), "assets/gijutu-turi-og.png"),
          resolve(process.cwd(), "dist/client/assets/gijutu-turi-og.png"),
        );
        copyFileSync(
          resolve(process.cwd(), "favicon.svg"),
          resolve(process.cwd(), "dist/client/favicon.svg"),
        );
        const builtFiles = (directory: string): string[] => !existsSync(directory) ? [] : readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
          const path = resolve(directory, entry.name);
          if (entry.isDirectory()) return builtFiles(path);
          if (!entry.isFile()) return [];
          return [relative(clientOutput, path).split(sep).join("/")];
        });
        writeFileSync(
          resolve(clientOutput, "precache-manifest.json"),
          `${JSON.stringify(createPrecacheManifest([
            ...builtFiles(resolve(clientOutput, "assets")),
            ...builtFiles(resolve(clientOutput, "chunks")),
          ]), null, 2)}\n`,
        );
      },
    },
  ],
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
      "/ready": { target: backendHttp, changeOrigin: true },
      "/ocean-ws": { target: backendWs, ws: true },
      "/manifest.webmanifest": { target: backendHttp },
      "/service-worker.js": { target: backendHttp },
      "/precache-manifest.json": { target: backendHttp },
      "/favicon.svg": { target: backendHttp },
      "/assets/gijutu-turi-logo.png": { target: backendHttp },
      "/assets/gijutu-turi-favicon-generated.png": { target: backendHttp },
      "/assets/gijutu-turi-og.png": { target: backendHttp },
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
