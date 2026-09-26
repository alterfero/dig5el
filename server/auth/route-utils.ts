import { apiError, apiSuccess, createRequestId, type ApiErrorCode } from "../http";
import { createLogger } from "../logger";
import { readNodeRuntimeBindings, RuntimeConfigError } from "../runtime-env";
import {
  AdminAuthorizationError,
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
} from "../admin/errors";
import { LocalAuthNotConfiguredError, getLocalAuthRuntime, type LocalAuthRuntime } from "./auth-runtime";
import { clearSessionCookie, buildSessionCookie, parseSessionCookie } from "./cookies";
import { CsrfProtectionError, assertAuthenticatedCsrf, assertSameOrigin } from "./csrf";
import { EmailValidationError } from "./identity";
import { AuthenticationRequiredError, AuthorizationError, requireAuthenticatedSession } from "./guards";
import {
  LocalAuthFlowError,
  LocalAuthRequestValidationError,
} from "./local-auth-service";
import { AuthAccountStateError, AuthStoreConflictError } from "./auth-store";
import { PasswordValidationError } from "./passwords";
import { AuthRateLimitError } from "./rate-limit";
import type { IssuedSession } from "./session-manager";

const maximumAuthBodyBytes = 16 * 1024;

export class AuthRequestValidationError extends Error {
  constructor() {
    super("The authentication request is not valid.");
    this.name = "AuthRequestValidationError";
  }
}

export type AuthRouteContext = {
  requestId: string;
  runtime: LocalAuthRuntime;
};

export type AuthenticatedRouteContext = AuthRouteContext & {
  cookieValue: string;
  session: Omit<IssuedSession, "cookieValue">;
};

function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return contentType === "application/json";
}

async function readLimitedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximumAuthBodyBytes) {
      throw new AuthRequestValidationError();
    }
  }
  if (!request.body) throw new AuthRequestValidationError();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximumAuthBodyBytes) {
        await reader.cancel();
        throw new AuthRequestValidationError();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new AuthRequestValidationError();
  }
}

/** Reads only a small, strict JSON object for the public auth actions. */
export async function readJsonObject(
  request: Request,
  fields: readonly string[],
): Promise<Record<string, unknown>> {
  if (!isJsonRequest(request)) throw new AuthRequestValidationError();
  let value: unknown;
  try {
    value = JSON.parse(await readLimitedBody(request));
  } catch (error) {
    if (error instanceof AuthRequestValidationError) throw error;
    throw new AuthRequestValidationError();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthRequestValidationError();
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new AuthRequestValidationError();
  }
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    output[field] = record[field];
  }
  return output;
}

/** Reads a strict all-string object for the public authentication flows. */
export async function readAuthJson(request: Request, fields: readonly string[]): Promise<Record<string, string>> {
  const record = await readJsonObject(request, fields);
  const output: Record<string, string> = {};
  for (const field of fields) {
    if (typeof record[field] !== "string") throw new AuthRequestValidationError();
    output[field] = record[field];
  }
  return output;
}

function errorCodeFor(error: unknown): { code: ApiErrorCode; retryAt?: Date } {
  if (error instanceof AuthRateLimitError) return { code: "RATE_LIMITED", retryAt: error.retryAt };
  if (error instanceof AuthenticationRequiredError) return { code: error.code };
  if (error instanceof CsrfProtectionError) {
    return { code: error.code === "CSRF_ORIGIN_REJECTED" ? "ORIGIN_MISMATCH" : "FORBIDDEN" };
  }
  if (error instanceof AuthorizationError || error instanceof AdminAuthorizationError) {
    return { code: "FORBIDDEN" };
  }
  if (error instanceof AdminConflictError) {
    return {
      code: error.code === "LANGUAGE_EXISTS"
        ? "LANGUAGE_EXISTS"
        : error.code === "LAST_MAINTAINER"
        ? "LAST_PROJECT_MAINTAINER"
        : error.code === "LAST_SYSTEM_ADMINISTRATOR"
          ? "LAST_SYSTEM_ADMINISTRATOR"
          : "MEMBERSHIP_EXISTS",
    };
  }
  if (error instanceof AdminNotFoundError) {
    return { code: error.resource === "user" ? "USER_NOT_FOUND" : "NOT_FOUND" };
  }
  if (error instanceof AuthStoreConflictError || error instanceof AuthAccountStateError) {
    return { code: "CONFLICT" };
  }
  if (error instanceof AdminValidationError) return { code: "INVALID_REQUEST" };
  if (error instanceof EmailValidationError) return { code: error.code };
  if (error instanceof PasswordValidationError) return { code: error.code };
  if (error instanceof AuthRequestValidationError || error instanceof LocalAuthRequestValidationError) {
    return { code: "INVALID_REQUEST" };
  }
  if (error instanceof LocalAuthFlowError) {
    return { code: error.code };
  }
  if (error instanceof LocalAuthNotConfiguredError || error instanceof RuntimeConfigError) {
    return { code: "AUTH_NOT_CONFIGURED" };
  }
  return { code: "INTERNAL" };
}

function withCookie(response: Response, cookie: string): Response {
  response.headers.set("set-cookie", cookie);
  return response;
}

export function authSuccess(
  data: Record<string, unknown>,
  requestId: string,
  status = 200,
): Response {
  return apiSuccess(data, requestId, status);
}

export function responseWithIssuedSession(
  issued: IssuedSession,
  runtime: LocalAuthRuntime,
  requestId: string,
): Response {
  return withCookie(
    // The client receives only a safe destination. It obtains the short-lived
    // CSRF token later from the authenticated same-origin session endpoint.
    authSuccess({ redirectTo: "/" }, requestId),
    buildSessionCookie(issued.cookieValue, issued.expiresAt, { secure: runtime.secureCookies }),
  );
}

/** Resolves a session and rolls the browser expiry forward when appropriate. */
export async function requireAuthenticatedRoute(
  context: AuthRouteContext,
  request: Request,
): Promise<AuthenticatedRouteContext> {
  const cookieValue = parseSessionCookie(request.headers.get("cookie"), context.runtime.secureCookies);
  const session = await requireAuthenticatedSession(context.runtime.sessions, cookieValue);
  if (!cookieValue) throw new AuthenticationRequiredError("AUTHENTICATION_REQUIRED");
  return { ...context, cookieValue, session };
}

export function requireSameOrigin(context: AuthRouteContext, request: Request): void {
  const origin = context.runtime.config.appOrigin;
  if (!origin) throw new LocalAuthNotConfiguredError();
  assertSameOrigin(request, origin);
}

export function requireAuthenticatedCsrf(
  context: AuthenticatedRouteContext,
  request: Request,
): void {
  const origin = context.runtime.config.appOrigin;
  if (!origin) throw new LocalAuthNotConfiguredError();
  assertAuthenticatedCsrf(
    request,
    origin,
    context.cookieValue,
    context.runtime.sessions.sessionSecret,
  );
}

/** Reissues the opaque cookie with the current server-side expiry. */
export async function responseWithResolvedSession(context: AuthenticatedRouteContext): Promise<Response> {
  const systemAdministrator = await context.runtime.persistence.store.isSystemAdministrator(context.session.user.id);
  return withCookie(
    authSuccess(
      {
        session: {
          csrfToken: context.session.csrfToken,
          expiresAt: context.session.expiresAt.toISOString(),
          user: { email: context.session.user.email, id: context.session.user.id, systemAdministrator },
        },
      },
      context.requestId,
    ),
    buildSessionCookie(context.cookieValue, context.session.expiresAt, {
      secure: context.runtime.secureCookies,
    }),
  );
}

/** Returns application data while keeping the browser cookie aligned with a rolling session. */
export function responseWithAuthenticatedSession(
  data: Record<string, unknown>,
  context: AuthenticatedRouteContext,
  status = 200,
): Response {
  return withCookie(
    authSuccess(data, context.requestId, status),
    buildSessionCookie(context.cookieValue, context.session.expiresAt, {
      secure: context.runtime.secureCookies,
    }),
  );
}

export function responseAfterLogout(context: AuthenticatedRouteContext): Response {
  return withCookie(
    authSuccess({ signedOut: true }, context.requestId),
    clearSessionCookie({ secure: context.runtime.secureCookies }),
  );
}

export async function runLocalAuthRoute(
  request: Request,
  route: string,
  action: (context: AuthRouteContext) => Promise<Response>,
): Promise<Response> {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const bindings = readNodeRuntimeBindings();
  let runtime: LocalAuthRuntime | null = null;
  let errorCode: ApiErrorCode | undefined;
  let response: Response;

  try {
    runtime = getLocalAuthRuntime(bindings);
    response = await action({ requestId, runtime });
  } catch (error) {
    const mapped = errorCodeFor(error);
    errorCode = mapped.code;
    response = apiError(mapped.code, requestId);
    if (mapped.retryAt) {
      const seconds = Math.max(1, Math.ceil((mapped.retryAt.getTime() - Date.now()) / 1000));
      response.headers.set("retry-after", String(seconds));
    }
    if (mapped.code === "SESSION_EXPIRED" && runtime) {
      withCookie(response, clearSessionCookie({ secure: runtime.secureCookies }));
    }
  }

  const logger = createLogger(bindings.DIG4EL_LOG_LEVEL);
  const record = {
    durationMs: Date.now() - startedAt,
    errorCode,
    event: "request.completed",
    method: request.method,
    requestId,
    route,
    status: response.status,
  };
  if (response.status >= 500) logger.error("request.completed", record);
  else if (response.status >= 400) logger.warn("request.completed", record);
  else logger.info("request.completed", record);
  return response;
}
