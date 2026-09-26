import { isIP } from "node:net";
import { createAuthStore, type AuthStoreRuntime } from "./create-auth-store";
import { LocalAuthService } from "./local-auth-service";
import { AuthRateLimiter } from "./rate-limit";
import {
  createSessionManager,
  decodeSessionSecret,
  defaultSessionPolicy,
  type SessionManager,
} from "./session-manager";
import {
  readNodeRuntimeBindings,
  validateRuntimeEnv,
  type RuntimeBindings,
  type ServerRuntimeConfig,
} from "../runtime-env";

export class LocalAuthNotConfiguredError extends Error {
  constructor() {
    super("Local account authentication is not configured.");
    this.name = "LocalAuthNotConfiguredError";
  }
}

export type LocalAuthRuntime = {
  config: ServerRuntimeConfig;
  persistence: AuthStoreRuntime;
  service: LocalAuthService;
  sessions: SessionManager;
  secureCookies: boolean;
};

function sessionPolicy(config: ServerRuntimeConfig) {
  const absoluteLifetimeMs = config.authSessionTtlSeconds * 1000;
  const idleLifetimeMs = Math.min(defaultSessionPolicy.idleLifetimeMs, absoluteLifetimeMs);
  return {
    absoluteLifetimeMs,
    idleLifetimeMs,
    renewalWindowMs: Math.min(defaultSessionPolicy.renewalWindowMs, idleLifetimeMs),
  };
}

/** Creates the local-account runtime only after all server-side settings validate. */
export function createLocalAuthRuntime(config: ServerRuntimeConfig): LocalAuthRuntime {
  if (
    config.dig4elAuthMode !== "local-password" ||
    !config.appOrigin ||
    !config.sessionEncryptionKey
  ) {
    throw new LocalAuthNotConfiguredError();
  }

  const persistence = createAuthStore({
    databaseUrl: config.databaseUrl?.toString(),
    environment: config.environment,
  });
  const secret = decodeSessionSecret(config.sessionEncryptionKey);
  const sessions = createSessionManager(persistence.store, secret, {
    policy: sessionPolicy(config),
  });
  const limiter = new AuthRateLimiter(persistence.store, secret);

  return {
    config,
    persistence,
    service: new LocalAuthService({
      limiter,
      sessions,
      store: persistence.store,
    }),
    sessions,
    secureCookies: config.environment === "staging" || config.environment === "production",
  };
}

let cachedRuntime: LocalAuthRuntime | null = null;

/**
 * Long-lived Node processes share one connection pool and (only in local
 * development) one in-memory store. Runtime variables are intentionally read
 * at process start; restart after changing a secret or account configuration.
 */
export function getLocalAuthRuntime(bindings: RuntimeBindings = readNodeRuntimeBindings()): LocalAuthRuntime {
  if (cachedRuntime) return cachedRuntime;
  const config = validateRuntimeEnv(bindings);
  cachedRuntime = createLocalAuthRuntime(config);
  return cachedRuntime;
}

/** Test-only lifecycle hook; production routes never call this. */
export async function resetLocalAuthRuntimeForTests(): Promise<void> {
  const runtime = cachedRuntime;
  cachedRuntime = null;
  await runtime?.persistence.close();
}

/**
 * Railway or another reverse proxy must be opted into explicitly. Without
 * that setting every unauthenticated request shares a conservative bucket,
 * rather than trusting a client-supplied forwarding header.
 */
export function trustedClientAddress(request: Request, runtime: LocalAuthRuntime): string {
  if (!runtime.config.trustProxy) return "unattributed-client";
  const candidate = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return candidate && isIP(candidate) !== 0 ? candidate : "unattributed-client";
}
