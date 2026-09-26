import type { AuthStore } from "./auth-store";
import { InMemoryAuthStore } from "./memory-auth-store";
import { PostgresAuthStore } from "./postgres-auth-store";

export type AuthPersistenceEnvironment = "development" | "production" | "staging" | "test";

export type AuthStoreConfiguration = {
  databaseUrl?: string | null;
  environment: AuthPersistenceEnvironment;
};

export type AuthStoreRuntime = {
  close: () => Promise<void>;
  persistent: boolean;
  store: AuthStore;
};

export class AuthPersistenceConfigurationError extends Error {
  constructor() {
    super("Secure account storage is not configured.");
    this.name = "AuthPersistenceConfigurationError";
  }
}

function configured(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

/**
 * Selects PostgreSQL whenever DATABASE_URL is present. An in-memory store is
 * intentionally limited to local development and tests; production fails
 * closed rather than accepting transient or multi-instance sessions.
 */
export function createAuthStore(configuration: AuthStoreConfiguration): AuthStoreRuntime {
  const databaseUrl = configured(configuration.databaseUrl);
  if (databaseUrl) {
    if (!validDatabaseUrl(databaseUrl)) throw new AuthPersistenceConfigurationError();
    const store = PostgresAuthStore.fromDatabaseUrl(databaseUrl);
    return { close: () => store.close(), persistent: true, store };
  }

  if (configuration.environment === "development" || configuration.environment === "test") {
    return {
      close: async () => undefined,
      persistent: false,
      store: new InMemoryAuthStore(),
    };
  }

  throw new AuthPersistenceConfigurationError();
}
