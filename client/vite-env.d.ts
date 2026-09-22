/// <reference types="vite/client" />

declare module "../go-fish.js" {
  export function createGoFish(options?: { detail?: "high" | "low"; phase?: number }): {
    group: import("three").Group;
    update(time: number, options: { power?: number; glow?: number }): void;
    dispose(): void;
  };
}

declare module "../k8s-fish.js" {
  export function createK8sFish(options?: { detail?: "high" | "low"; phase?: number }): {
    group: import("three").Group;
    update(time: number, options: { power?: number; glow?: number }): void;
    dispose(): void;
  };
}
