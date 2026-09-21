// @ts-nocheck -- small cross-platform process runner for the local development command.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const tsxCli = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = resolve(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const backendPort = process.env.BACKEND_PORT ?? "8787";
const vitePort = process.env.VITE_PORT ?? "8788";
const children = [
  spawn(process.execPath, [tsxCli, "watch", "src/index.ts"], {
    env: { ...process.env, HOST: process.env.HOST ?? "0.0.0.0", PORT: backendPort },
    stdio: "inherit",
  }),
  spawn(process.execPath, [viteCli, "--host", "0.0.0.0", "--port", vitePort], {
    env: { ...process.env, BACKEND_PORT: backendPort, VITE_PORT: vitePort },
    stdio: "inherit",
  }),
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
};

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
