export type DevService = "backend" | "vite";
export type DevProbeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Identifies the expected app before the dev runner reuses an occupied port. */
export async function isExpectedDevService(
  port: string | number,
  service: DevService,
  fetcher: DevProbeFetch = fetch,
): Promise<boolean> {
  const path = service === "backend" ? "/health" : "/@vite/client";
  try {
    const response = await fetcher(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return false;

    if (service === "backend") {
      const payload: unknown = await response.json();
      return typeof payload === "object" && payload !== null
        && "service" in payload && payload.service === "gijutu-turi-backend";
    }

    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("javascript") && (await response.text()).includes("createHotContext");
  } catch {
    return false;
  }
}
