const productionBackendVariables = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_D1_DATABASE_ID",
  "CLOUDFLARE_API_TOKEN",
  "DATABASE_URL",
  "VITE_BACKEND_URL",
  "VITE_PUBLIC_ORIGIN",
  "VITE_STATIC_ROUTE_MODE",
] as const;

/** Keep the phone-motion demo isolated from any configured production backend. */
export function createPhoneHttpsDevelopmentEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...source, NODE_ENV: "development" };
  for (const variable of productionBackendVariables) delete environment[variable];
  return environment;
}
