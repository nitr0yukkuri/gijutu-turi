import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8789",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:8789/ready",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { HOST: "127.0.0.1", PORT: "8789", GIJUTU_DB_PATH: ":memory:" },
  },
});
