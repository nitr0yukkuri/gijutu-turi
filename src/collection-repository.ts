import type { CollectionRepository } from "./collection-contract.js";

export type CollectionBackend = "sqlite" | "postgres" | "d1";

type Environment = Record<string, string | undefined>;

const read = (environment: Environment, key: string): string => environment[key]?.trim() ?? "";

export function resolveCollectionBackend(environment: Environment = process.env): CollectionBackend {
  const d1 = {
    accountId: read(environment, "CLOUDFLARE_ACCOUNT_ID"),
    databaseId: read(environment, "CLOUDFLARE_D1_DATABASE_ID"),
    apiToken: read(environment, "CLOUDFLARE_API_TOKEN"),
  };
  const hasD1Setting = Object.values(d1).some(Boolean);
  const databaseUrl = read(environment, "DATABASE_URL");

  if (hasD1Setting) {
    if (!d1.accountId || !d1.databaseId || !d1.apiToken) throw new Error("incomplete_d1_configuration");
    if (databaseUrl) throw new Error("multiple_collection_backends_configured");
    return "d1";
  }
  return databaseUrl ? "postgres" : "sqlite";
}

export async function createCollectionRepository(environment: Environment = process.env): Promise<CollectionRepository> {
  switch (resolveCollectionBackend(environment)) {
    case "d1": {
      const { D1CollectionStore } = await import("./d1-collection-db.js");
      return D1CollectionStore.connect({
        accountId: read(environment, "CLOUDFLARE_ACCOUNT_ID"),
        databaseId: read(environment, "CLOUDFLARE_D1_DATABASE_ID"),
        apiToken: read(environment, "CLOUDFLARE_API_TOKEN"),
      });
    }
    case "postgres": {
      const { PostgresCollectionStore } = await import("./postgres-collection-db.js");
      return PostgresCollectionStore.connect(read(environment, "DATABASE_URL"));
    }
    case "sqlite": {
      const { CollectionStore } = await import("./collection-db.js");
      return new CollectionStore(read(environment, "GIJUTU_DB_PATH") || undefined);
    }
  }
}
