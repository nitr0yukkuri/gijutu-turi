export function isSafePrecachePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const root = segments[0];
  return (root === "assets" || root === "chunks")
    && segments.length > 1
    && segments.slice(1).every(segment => segment.length > 0 && segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/.test(segment))
    && /\.(?:js|css)$/.test(segments.at(-1) ?? "");
}

/** Keep the offline manifest limited to same-origin JavaScript and CSS build outputs. */
export function createPrecacheManifest(paths: readonly string[]): string[] {
  return [...new Set(paths.map(path => path.replaceAll("\\", "/")))]
    .filter(isSafePrecachePath)
    .sort();
}
