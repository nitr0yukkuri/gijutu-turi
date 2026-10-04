export const isLoopbackHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "[::1]";

export type ControllerLink = { href: string; host: string };

export type ControllerLinkOptions = {
  routeMode?: "path" | "query";
  fishQuery?: string;
};

/** Build a phone link that uses the PC's LAN host when the display is local. */
export function createControllerLink(
  origin: string,
  routePath: string,
  controllerId: string,
  roomHost?: string,
  options: ControllerLinkOptions = {},
): ControllerLink | null {
  const url = new URL(options.routeMode === "query" ? "/" : routePath, origin);
  if (isLoopbackHost(url.hostname)) {
    if (!roomHost || isLoopbackHost(roomHost)) return null;
    url.hostname = roomHost;
  }
  if (options.routeMode === "query" && options.fishQuery) {
    url.searchParams.set("fish", options.fishQuery);
  }
  url.searchParams.set("controller", controllerId);
  return { href: url.href, host: url.hostname };
}
