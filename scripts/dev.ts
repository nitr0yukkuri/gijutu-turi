// @ts-nocheck -- small cross-platform process runner for the local development command.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import process from "node:process";
import { isExpectedDevService } from "./dev-probe.js";

const tsxCli = resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = resolve(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const backendPort = process.env.BACKEND_PORT ?? "8787";
const vitePort = process.env.VITE_PORT ?? "8788";
const isPortInUse = (port: string): Promise<boolean> => new Promise(resolvePort => {
  const socket = createConnection({ host: "127.0.0.1", port: Number(port) });
  const finish = (inUse: boolean) => { socket.destroy(); resolvePort(inUse); };
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.setTimeout(250, () => finish(false));
});

const backendInUse = await isPortInUse(backendPort);
const viteInUse = await isPortInUse(vitePort);
if (backendInUse && !(await isExpectedDevService(backendPort, "backend"))) {
  console.error(`[dev] backend port ${backendPort} is occupied by a service that is not gijutu-turi. Stop it or choose another BACKEND_PORT.`);
  process.exit(1);
}
if (viteInUse && !(await isExpectedDevService(vitePort, "vite"))) {
  console.error(`[dev] Vite port ${vitePort} is occupied by a service that is not this project's Vite server. Stop it or choose another VITE_PORT.`);
  process.exit(1);
}

const children = [];
if (backendInUse) {
  console.warn(`[dev] verified existing gijutu-turi backend on port ${backendPort}; reusing it.`);
} else {
  children.push(spawn(process.execPath, [tsxCli, "src/index.ts"], {
    env: { ...process.env, HOST: process.env.HOST ?? "0.0.0.0", PORT: backendPort },
    stdio: "inherit",
  }));
}
if (viteInUse) {
  console.warn(`[dev] verified existing Vite client on port ${vitePort}; reusing it.`);
} else {
  children.push(spawn(process.execPath, [viteCli, "--host", "0.0.0.0", "--port", vitePort], {
    env: { ...process.env, BACKEND_PORT: backendPort, VITE_PORT: vitePort },
    stdio: "inherit",
  }));
}

if (children.length === 0) console.log("[dev] Existing client and backend are already running.");

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
};

for (const child of children) {
  child.on("error", (error) => {
    console.error("[dev] child process error", error);
    if (!stopping) stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`[dev] child process exited (code=${code ?? "null"})`);
      stop(code ?? 1);
    }
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
