import type { LogLevel } from "./runtime-env";

export type ServerLogRecord = {
  durationMs?: number;
  errorCode?: string;
  event: string;
  method?: string;
  requestId?: string;
  route?: string;
  status?: number;
  upstreamStatus?: number;
  [field: string]: unknown;
};

type LogWriter = (level: Exclude<LogLevel, "silent">, record: ServerLogRecord) => void;

const redacted = "[REDACTED]";
const omitted = "[OMITTED]";
const sensitiveKey = /authorization|cookie|password|token|secret|api[-_]?key|credential|session|body/i;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

function safeLogLevel(value: string | undefined): LogLevel {
  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error" ||
    value === "silent"
  ) {
    return value;
  }
  return "info";
}

/** Removes credentials, bodies, error messages, and other secret-shaped data. */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return omitted;
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? redacted : redactForLog(item, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 512) return omitted;
  return value;
}

function writeToConsole(
  level: Exclude<LogLevel, "silent">,
  record: ServerLogRecord,
): void {
  const serialized = JSON.stringify(record);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

export function createLogger(logLevel?: string, writer: LogWriter = writeToConsole) {
  const minimumLevel = safeLogLevel(logLevel);

  function log(level: Exclude<LogLevel, "silent">, record: ServerLogRecord): void {
    if (levelWeight[level] < levelWeight[minimumLevel]) return;
    writer(level, redactForLog(record) as ServerLogRecord);
  }

  return {
    debug: (event: string, record: ServerLogRecord = { event }) =>
      log("debug", { ...record, event }),
    info: (event: string, record: ServerLogRecord = { event }) =>
      log("info", { ...record, event }),
    warn: (event: string, record: ServerLogRecord = { event }) =>
      log("warn", { ...record, event }),
    error: (event: string, record: ServerLogRecord = { event }) =>
      log("error", { ...record, event }),
  };
}
