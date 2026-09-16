export type ApiErrorCode =
  | "FORBIDDEN"
  | "INTERNAL"
  | "INVALID_REQUEST"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "PLAID_SESSION_EXPIRED"
  | "UPSTREAM_UNAVAILABLE";

type JsonObject = Record<string, unknown>;

const errorDefaults: Record<
  ApiErrorCode,
  { message: string; retryable: boolean; status: number }
> = {
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
  PLAID_SESSION_EXPIRED: {
    message: "Your PLAID connection has expired. Please reconnect when sign-in is available.",
    retryable: false,
    status: 401,
  },
  UPSTREAM_UNAVAILABLE: {
    message: "The connected service is unavailable right now. Please try again soon.",
    retryable: true,
    status: 503,
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
