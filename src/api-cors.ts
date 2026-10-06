export function apiCorsHeaders(origin: string | undefined, configuredOrigins: ReadonlySet<string>): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Retry-After",
  };
  if (configuredOrigins.has("*")) headers["Access-Control-Allow-Origin"] = "*";
  else if (origin && configuredOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}
