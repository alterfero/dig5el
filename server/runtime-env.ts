/**
 * Server-only runtime configuration.
 *
 * Browser code must never import this module. Values arrive from server-side
 * environment variables in production and ignored local files in development.
 */
export type RuntimeBindings = {
  AUTH_SESSION_TTL_SECONDS?: string;
  DATABASE_URL?: string;
  DIG4EL_AUTH_MODE?: string;
  DIG4EL_ENVIRONMENT?: string;
  DIG4EL_LOG_LEVEL?: string;
  DIG4EL_APP_ORIGIN?: string;
  DIG4EL_TRUST_PROXY?: string;
  NODE_ENV?: string;
  PLAID_AUTH_MODE?: string;
  PLAID_BASE_URL?: string;
  SESSION_ENCRYPTION_KEY?: string;
  PLAID_SERVICE_TOKEN?: string;
};

/**
 * Copies only the allow-listed server settings from the Node runtime. This
 * helper belongs in server-only code and must never be imported by a client
 * component.
 */
export function readNodeRuntimeBindings(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeBindings {
  return {
    AUTH_SESSION_TTL_SECONDS: environment.AUTH_SESSION_TTL_SECONDS,
    DATABASE_URL: environment.DATABASE_URL,
    DIG4EL_AUTH_MODE: environment.DIG4EL_AUTH_MODE,
    DIG4EL_APP_ORIGIN: environment.DIG4EL_APP_ORIGIN,
    DIG4EL_ENVIRONMENT: environment.DIG4EL_ENVIRONMENT,
    DIG4EL_LOG_LEVEL: environment.DIG4EL_LOG_LEVEL,
    DIG4EL_TRUST_PROXY: environment.DIG4EL_TRUST_PROXY,
    NODE_ENV: environment.NODE_ENV,
    PLAID_AUTH_MODE: environment.PLAID_AUTH_MODE,
    PLAID_BASE_URL: environment.PLAID_BASE_URL,
    PLAID_SERVICE_TOKEN: environment.PLAID_SERVICE_TOKEN,
    SESSION_ENCRYPTION_KEY: environment.SESSION_ENCRYPTION_KEY,
  };
}

export type Dig4elEnvironment = "development" | "test" | "staging" | "production";
export type Dig4elAuthMode = "disabled" | "local-password";
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type PlaidAuthMode = "disabled" | "approved";

export type ServerRuntimeConfig = {
  authSessionTtlSeconds: number;
  databaseUrl: URL | null;
  dig4elAuthMode: Dig4elAuthMode;
  environment: Dig4elEnvironment;
  logLevel: LogLevel;
  appOrigin: URL | null;
  plaidAuthMode: PlaidAuthMode;
  plaidBaseUrl: URL | null;
  sessionEncryptionKey: string | null;
  plaidServiceToken: string | null;
  trustProxy: boolean;
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

function parseDatabaseUrl(value: string | null, issues: string[]): URL | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      issues.push("DATABASE_URL must use a PostgreSQL URL.");
    }
    return parsed;
  } catch {
    issues.push("DATABASE_URL must be a valid PostgreSQL URL.");
    return null;
  }
}

function parsePositiveInteger(
  value: string | null,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  issues: string[],
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(`${name} must be a whole number between ${minimum} and ${maximum}.`);
    return fallback;
  }
  return parsed;
}

function parseOptionalBoolean(
  value: string | null,
  name: string,
  fallback: boolean,
  issues: string[],
): boolean {
  if (!value) return fallback;
  if (value === "false") return false;
  if (value === "true") return true;
  issues.push(`${name} must be either true or false.`);
  return false;
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
  const environmentValue = configured(bindings.DIG4EL_ENVIRONMENT);
  const environment = environmentValue && environments.has(environmentValue as Dig4elEnvironment)
    ? (environmentValue as Dig4elEnvironment)
    : null;

  if (!environment) {
    issues.push("DIG4EL_ENVIRONMENT must be explicitly set to a recognized environment.");
  }
  const nodeEnvironment = configured(bindings.NODE_ENV);
  if (
    nodeEnvironment === "production" &&
    environment !== "production" &&
    environment !== "staging"
  ) {
    issues.push("DIG4EL_ENVIRONMENT must be staging or production when the Node runtime is production.");
  }
  if (nodeEnvironment === "development" && environment && environment !== "development") {
    issues.push("DIG4EL_ENVIRONMENT must be development when the Node runtime is development.");
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
  const dig4elAuthMode = configured(bindings.DIG4EL_AUTH_MODE) ?? "disabled";
  if (dig4elAuthMode !== "disabled" && dig4elAuthMode !== "local-password") {
    issues.push("DIG4EL_AUTH_MODE is not recognized.");
  }
  const appOriginValue = configured(bindings.DIG4EL_APP_ORIGIN);
  const appOrigin = parsePinnedOrigin(
    appOriginValue,
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
  const databaseUrl = parseDatabaseUrl(configured(bindings.DATABASE_URL), issues);
  const authSessionTtlSeconds = parsePositiveInteger(
    configured(bindings.AUTH_SESSION_TTL_SECONDS),
    "AUTH_SESSION_TTL_SECONDS",
    28_800,
    300,
    604_800,
    issues,
  );
  const trustProxy = parseOptionalBoolean(
    configured(bindings.DIG4EL_TRUST_PROXY),
    "DIG4EL_TRUST_PROXY",
    false,
    issues,
  );
  if (
    (resolvedEnvironment === "staging" || resolvedEnvironment === "production") &&
    !appOriginValue
  ) {
    issues.push("DIG4EL_APP_ORIGIN is required outside local development.");
  }

  if (sessionEncryptionKey && !isThirtyTwoByteKey(sessionEncryptionKey)) {
    issues.push("SESSION_ENCRYPTION_KEY must encode exactly 32 bytes.");
  }

  if (dig4elAuthMode === "local-password") {
    if (!sessionEncryptionKey) {
      issues.push("SESSION_ENCRYPTION_KEY is required when DIG4EL local auth is enabled.");
    }
    if (!appOriginValue) {
      issues.push("DIG4EL_APP_ORIGIN is required when DIG4EL local auth is enabled.");
    }
    if ((resolvedEnvironment === "staging" || resolvedEnvironment === "production") && !databaseUrl) {
      issues.push("DATABASE_URL is required outside local development when DIG4EL auth is enabled.");
    }
  }

  if (issues.length > 0) throw new RuntimeConfigError(issues);

  return {
    authSessionTtlSeconds,
    databaseUrl,
    dig4elAuthMode: dig4elAuthMode === "local-password" ? "local-password" : "disabled",
    environment: resolvedEnvironment,
    logLevel: logLevel ?? "info",
    appOrigin,
    plaidAuthMode: "disabled",
    plaidBaseUrl,
    sessionEncryptionKey,
    plaidServiceToken,
    trustProxy,
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
