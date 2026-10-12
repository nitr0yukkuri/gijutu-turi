import assert from "node:assert/strict";
import test from "node:test";
import { createPhoneHttpsDevelopmentEnvironment } from "./dev-phone-https-env.js";

test("phone-motion development cannot inherit production database or backend overrides", () => {
  const environment = createPhoneHttpsDevelopmentEnvironment({
    NODE_ENV: "production",
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_D1_DATABASE_ID: "database",
    CLOUDFLARE_API_TOKEN: "secret",
    DATABASE_URL: "postgres://production",
    VITE_BACKEND_URL: "https://production.example",
    VITE_PUBLIC_ORIGIN: "https://production.example",
    VITE_STATIC_ROUTE_MODE: "query",
    VITE_PORT: "8790",
  });

  assert.equal(environment.NODE_ENV, "development");
  assert.equal(environment.CLOUDFLARE_ACCOUNT_ID, undefined);
  assert.equal(environment.CLOUDFLARE_D1_DATABASE_ID, undefined);
  assert.equal(environment.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.VITE_BACKEND_URL, undefined);
  assert.equal(environment.VITE_PUBLIC_ORIGIN, undefined);
  assert.equal(environment.VITE_STATIC_ROUTE_MODE, undefined);
  assert.equal(environment.VITE_PORT, "8790");
});
