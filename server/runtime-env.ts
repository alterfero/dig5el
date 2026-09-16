/**
 * Server-only runtime configuration.
 *
 * Browser code must never import this module. Values arrive from Worker secret
 * bindings in production and from ignored local environment files in development.
 */
export type RuntimeBindings = {
  DIG4EL_ENVIRONMENT?: string;
  DIG4EL_LOG_LEVEL?: string;
  DIG4EL_APP_ORIGIN?: string;
  PLAID_AUTH_MODE?: string;
  PLAID_BASE_URL?: string;
  SESSION_ENCRYPTION_KEY?: string;
  PLAID_SERVICE_TOKEN?: string;
};

export type Dig4elEnvironment = "development" | "test" | "staging" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type PlaidAuthMode = "disabled" | "approved";

export type ServerRuntimeConfig = {
  environment: Dig4elEnvironment;
  logLevel: LogLevel;
  appOrigin: URL | null;
  plaidAuthMode: PlaidAuthMode;
  plaidBaseUrl: URL | null;
  sessionEncryptionKey: string | null;
  plaidServiceToken: string | null;
};

export class RuntimeConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super("Server configuration is incomplete or invalid.");
    this.name = "RuntimeConfigError";
    this.issues = issues;
  }
}

const environments = new Set<Dig4elEnvironment>([
  "development",
  "test",
  "staging",
  "production",
]);

const logLevels = new Set<LogLevel>([
  "debug",
  "info",
  "warn",
  "error",
  "silent",
]);

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function parsePinnedOrigin(
  value: string | null,
  name: string,
  environment: Dig4elEnvironment,
  issues: string[],
): URL | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const hasPath = parsed.pathname !== "/" || parsed.search || parsed.hash;
    const allowsHttp =
      environment === "development" &&
      parsed.protocol === "http:" &&
      isLoopbackHost(parsed.hostname);

    if (parsed.username || parsed.password || hasPath) {
      issues.push(`${name} must be an origin without credentials, path, query, or fragment.`);
    } else if (parsed.protocol !== "https:" && !allowsHttp) {
      issues.push(`${name} must use HTTPS outside local development.`);
    }

    return parsed;
  } catch {
    issues.push(`${name} must be a valid absolute origin.`);
    return null;
  }
}

function isThirtyTwoByteKey(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value) || /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Validates configuration once at the server boundary. Error details are for
 * operators only; callers should expose only a generic readiness state.
 */
export function validateRuntimeEnv(bindings: RuntimeBindings): ServerRuntimeConfig {
  const issues: string[] = [];
  const environmentValue = configured(bindings.DIG4EL_ENVIRONMENT) ?? "development";
  const environment = environments.has(environmentValue as Dig4elEnvironment)
    ? (environmentValue as Dig4elEnvironment)
    : null;

  if (!environment) {
    issues.push("DIG4EL_ENVIRONMENT must be development, test, staging, or production.");
  }

  const logLevelValue = configured(bindings.DIG4EL_LOG_LEVEL) ?? "info";
  const logLevel = logLevels.has(logLevelValue as LogLevel)
    ? (logLevelValue as LogLevel)
    : null;
  if (!logLevel) {
    issues.push("DIG4EL_LOG_LEVEL is not recognized.");
  }

  const plaidAuthMode = configured(bindings.PLAID_AUTH_MODE) ?? "disabled";
  if (plaidAuthMode !== "disabled") {
    issues.push("PLAID_AUTH_MODE is not enabled in this foundation.");
  }

  const resolvedEnvironment = environment ?? "development";
  const appOrigin = parsePinnedOrigin(
    configured(bindings.DIG4EL_APP_ORIGIN),
    "DIG4EL_APP_ORIGIN",
    resolvedEnvironment,
    issues,
  );
  const plaidBaseUrl = parsePinnedOrigin(
    configured(bindings.PLAID_BASE_URL),
    "PLAID_BASE_URL",
    resolvedEnvironment,
    issues,
  );
  const sessionEncryptionKey = configured(bindings.SESSION_ENCRYPTION_KEY);
  const plaidServiceToken = configured(bindings.PLAID_SERVICE_TOKEN);

  if (sessionEncryptionKey && !isThirtyTwoByteKey(sessionEncryptionKey)) {
    issues.push("SESSION_ENCRYPTION_KEY must encode exactly 32 bytes.");
  }

  if (issues.length > 0) throw new RuntimeConfigError(issues);

  return {
    environment: resolvedEnvironment,
    logLevel: logLevel ?? "info",
    appOrigin,
    plaidAuthMode: "disabled",
    plaidBaseUrl,
    sessionEncryptionKey,
    plaidServiceToken,
  };
}

export function inspectRuntimeEnv(
  bindings: RuntimeBindings,
): { ready: true; config: ServerRuntimeConfig } | { ready: false } {
  try {
    return { ready: true, config: validateRuntimeEnv(bindings) };
  } catch {
    return { ready: false };
  }
}
