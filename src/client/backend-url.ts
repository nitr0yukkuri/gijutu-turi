export const configuredBackendUrl = (import.meta.env.VITE_BACKEND_URL ?? "").trim().replace(/\/+$/, "");

export const backendUrl = (path: string): string => configuredBackendUrl ? configuredBackendUrl + path : path;
