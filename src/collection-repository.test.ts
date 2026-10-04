import assert from "node:assert/strict";
import test from "node:test";
import { createCollectionRepository, resolveCollectionBackend } from "./collection-repository.js";

test("collection storage defaults to local SQLite", () => {
  assert.equal(resolveCollectionBackend({}), "sqlite");
  assert.equal(resolveCollectionBackend({ GIJUTU_DB_PATH: "/tmp/test.sqlite" }), "sqlite");
});

test("D1 is selected only with complete credentials and cannot conflict with PostgreSQL", () => {
  assert.equal(resolveCollectionBackend({
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_D1_DATABASE_ID: "database",
    CLOUDFLARE_API_TOKEN: "secret",
  }), "d1");
  assert.throws(
    () => resolveCollectionBackend({ CLOUDFLARE_ACCOUNT_ID: "account" }),
    { message: "incomplete_d1_configuration" },
  );
  assert.throws(
    () => resolveCollectionBackend({
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_D1_DATABASE_ID: "database",
      CLOUDFLARE_API_TOKEN: "secret",
      DATABASE_URL: "postgres://example.invalid/database",
    }),
    { message: "multiple_collection_backends_configured" },
  );
});

test("PostgreSQL remains opt-in and local SQLite stays the no-configuration default", () => {
  assert.equal(resolveCollectionBackend({ DATABASE_URL: "postgres://example.invalid/database" }), "postgres");
  assert.equal(resolveCollectionBackend({ DATABASE_URL: "  " }), "sqlite");
});

test("D1 factory initializes the selected adapter without using the real Cloudflare API", async () => {
  const previousFetch = globalThis.fetch;
  const requests: string[][] = [];
  globalThis.fetch = (async (_input, init = {}) => {
    const body = JSON.parse(String(init.body)) as { batch?: { sql: string }[]; sql?: string };
    const statements = body.batch ?? (body.sql ? [{ sql: body.sql }] : []);
    requests.push(statements.map(statement => statement.sql));
    return new Response(JSON.stringify({
      success: true,
      result: statements.map(statement => ({
        success: true,
        results: statement.sql === "SELECT 1 AS ready" ? [{ ready: 1 }] : [],
        meta: { changes: 0 },
      })),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  let repository: Awaited<ReturnType<typeof createCollectionRepository>> | undefined;
  try {
    repository = await createCollectionRepository({
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_D1_DATABASE_ID: "test-database",
      CLOUDFLARE_API_TOKEN: "test-token",
    });
    assert.equal(repository.constructor.name, "D1CollectionStore");
    await repository.ping();
    assert.ok(requests[0]?.some(sql => sql.startsWith("CREATE TABLE IF NOT EXISTS fish_species")));
    assert.deepEqual(requests.at(-1), ["SELECT 1 AS ready"]);
  } finally {
    if (repository) await repository.close();
    globalThis.fetch = previousFetch;
  }
});
