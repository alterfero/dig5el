export type ApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTH_NOT_CONFIGURED"
  | "CONFLICT"
  | "EMAIL_INVALID"
  | "EMAIL_TOO_LONG"
  | "INVALID_CREDENTIALS"
  | "INVALID_OR_EXPIRED_TOKEN"
  | "FORBIDDEN"
  | "INTERNAL"
  | "INVALID_REQUEST"
  | "LAST_PROJECT_MAINTAINER"
  | "LAST_SYSTEM_ADMINISTRATOR"
  | "LANGUAGE_EXISTS"
  | "MEMBERSHIP_EXISTS"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "ORIGIN_MISMATCH"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_TOO_SHORT"
  | "PLAID_SESSION_EXPIRED"
  | "RATE_LIMITED"
  | "SESSION_EXPIRED"
  | "UNAUTHORIZED"
  | "USER_NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE";

type JsonObject = Record<string, unknown>;

const errorDefaults: Record<
  ApiErrorCode,
  { message: string; retryable: boolean; status: number }
> = {
  AUTHENTICATION_REQUIRED: {
    message: "Please sign in to continue.",
    retryable: false,
    status: 401,
  },
  AUTH_NOT_CONFIGURED: {
    message: "Account sign-in is not available just yet. Please try again soon.",
    retryable: true,
    status: 503,
  },
  CONFLICT: {
    message: "That change cannot be made right now.",
    retryable: false,
    status: 409,
  },
  EMAIL_INVALID: {
    message: "Please enter a valid email address.",
    retryable: false,
    status: 400,
  },
  EMAIL_TOO_LONG: {
    message: "Please enter a shorter email address.",
    retryable: false,
    status: 400,
  },
  INVALID_CREDENTIALS: {
    message: "That email or password does not look right.",
    retryable: false,
    status: 401,
  },
  INVALID_OR_EXPIRED_TOKEN: {
    message: "That setup or recovery code is no longer valid. Please ask an administrator for a new one.",
    retryable: false,
    status: 400,
  },
  FORBIDDEN: {
    message: "You do not have permission to do that.",
    retryable: false,
    status: 403,
  },
  INTERNAL: {
    message: "Something went wrong on our side. Please try again.",
    retryable: true,
    status: 500,
  },
  INVALID_REQUEST: {
    message: "Please check that request and try again.",
    retryable: false,
    status: 400,
  },
  LAST_PROJECT_MAINTAINER: {
    message: "Each language project needs at least one maintainer.",
    retryable: false,
    status: 409,
  },
  LAST_SYSTEM_ADMINISTRATOR: {
    message: "Keep at least one active system administrator.",
    retryable: false,
    status: 409,
  },
  LANGUAGE_EXISTS: {
    message: "That language is already available in DIG4EL.",
    retryable: false,
    status: 409,
  },
  MEMBERSHIP_EXISTS: {
    message: "That person already has access to this language project.",
    retryable: false,
    status: 409,
  },
  METHOD_NOT_ALLOWED: {
    message: "That action is not available here.",
    retryable: false,
    status: 405,
  },
  NOT_FOUND: {
    message: "That service address is not available.",
    retryable: false,
    status: 404,
  },
  ORIGIN_MISMATCH: {
    message: "Open DIG4EL using the same local address you started it with, then try again.",
    retryable: false,
    status: 403,
  },
  PASSWORD_TOO_LONG: {
    message: "Please use a shorter password.",
    retryable: false,
    status: 400,
  },
  PASSWORD_TOO_SHORT: {
    message: "Please use a longer password.",
    retryable: false,
    status: 400,
  },
  PLAID_SESSION_EXPIRED: {
    message: "Your PLAID connection has expired. Please reconnect when sign-in is available.",
    retryable: false,
    status: 401,
  },
  RATE_LIMITED: {
    message: "Please wait a moment before trying again.",
    retryable: true,
    status: 429,
  },
  SESSION_EXPIRED: {
    message: "Your session has ended. Please sign in again.",
    retryable: false,
    status: 401,
  },
  UPSTREAM_UNAVAILABLE: {
    message: "The connected service is unavailable right now. Please try again soon.",
    retryable: true,
    status: 503,
  },
  UNAUTHORIZED: {
    message: "You do not have access to that.",
    retryable: false,
    status: 403,
  },
  USER_NOT_FOUND: {
    message: "That DIG4EL account is not available.",
    retryable: false,
    status: 404,
  },
};

function responseHeaders(requestId: string): Headers {
  return new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  });
}

export function createRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function apiSuccess(
  data: JsonObject,
  requestId: string,
  status = 200,
): Response {
  return new Response(JSON.stringify({ data, meta: { requestId } }), {
    status,
    headers: responseHeaders(requestId),
  });
}

export function apiError(
  code: ApiErrorCode,
  requestId: string,
  status = errorDefaults[code].status,
): Response {
  const defaults = errorDefaults[code];
  return new Response(
    JSON.stringify({
      error: {
        code,
        message: defaults.message,
        requestId,
        retryable: defaults.retryable,
      },
    }),
    { status, headers: responseHeaders(requestId) },
  );
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
