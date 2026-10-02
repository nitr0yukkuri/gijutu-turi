export type HookResult = "normal" | "critical";

// The fish approaches the bait for .9s after the float dips. Center a forgiving
// timing window around that visible arrival, with room for touch/network latency.
export const CRITICAL_HOOK_WINDOW_START_SECONDS = 0.55;
export const CRITICAL_HOOK_WINDOW_END_SECONDS = 1.6;

export const isCriticalHookWindow = (biteAgeSeconds: number): boolean =>
  Number.isFinite(biteAgeSeconds)
  && biteAgeSeconds >= CRITICAL_HOOK_WINDOW_START_SECONDS
  && biteAgeSeconds <= CRITICAL_HOOK_WINDOW_END_SECONDS;

export const getHookResult = (biteAgeSeconds: number): HookResult =>
  isCriticalHookWindow(biteAgeSeconds) ? "critical" : "normal";
