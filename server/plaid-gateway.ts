/**
 * The single server-side seam for future PLAID REST calls.
 *
 * It deliberately has no browser-facing route and accepts only a pinned PLAID
 * origin from validated runtime configuration. Product features will be added
 * here after the PLAID auth hand-off and OpenAPI contract are approved.
 */
import type { ServerRuntimeConfig } from "./runtime-env";

export type PlaidCredential =
  | { kind: "delegated-user"; token: string }
  | { kind: "service"; token: string };

export type PlaidOperation = "background" | "user-directed";

export type PlaidRequest = {
  body?: BodyInit | null;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  operation: PlaidOperation;
  path: string;
};

type FetchImplementation = typeof fetch;

export class PlaidGatewayError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "UPSTREAM_UNAVAILABLE",
    readonly retryable: boolean,
    readonly upstreamStatus?: number,
  ) {
    super(code);
    this.name = "PlaidGatewayError";
  }
}

function validPlaidPath(path: string): string {
  if (!path.startsWith("/api/v1/") || path.startsWith("//") || path.includes("\\")) {
    throw new PlaidGatewayError("INVALID_REQUEST", false);
  }

  const parsed = new URL(path, "https://dig4el.invalid");
  if (
    parsed.origin !== "https://dig4el.invalid" ||
    !parsed.pathname.startsWith("/api/v1/") ||
    parsed.hash
  ) {
    throw new PlaidGatewayError("INVALID_REQUEST", false);
  }

  return `${parsed.pathname}${parsed.search}`;
}

export function createPlaidGateway(
  config: ServerRuntimeConfig,
  fetchImplementation: FetchImplementation = fetch,
) {
  const plaidBaseUrl = config.plaidBaseUrl;
  if (!plaidBaseUrl) {
    throw new PlaidGatewayError("UPSTREAM_UNAVAILABLE", true);
  }
  if (config.plaidAuthMode === "disabled") {
    throw new PlaidGatewayError("FORBIDDEN", false);
  }

  return {
    async request(request: PlaidRequest, credential: PlaidCredential): Promise<Response> {
      if (request.operation === "user-directed" && credential.kind !== "delegated-user") {
        throw new PlaidGatewayError("FORBIDDEN", false);
      }

      const path = validPlaidPath(request.path);
      const target = new URL(path, plaidBaseUrl);
      if (
        target.origin !== plaidBaseUrl.origin ||
        !target.pathname.startsWith("/api/v1/")
      ) {
        throw new PlaidGatewayError("INVALID_REQUEST", false);
      }

      let response: Response;
      try {
        response = await fetchImplementation(target, {
          body: request.body,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${credential.token}`,
          },
          method: request.method,
          redirect: "error",
        });
      } catch {
        throw new PlaidGatewayError("UPSTREAM_UNAVAILABLE", true);
      }

      if (!response.ok) {
        const code = response.status === 401 || response.status === 403
          ? "FORBIDDEN"
          : "UPSTREAM_UNAVAILABLE";
        throw new PlaidGatewayError(code, code === "UPSTREAM_UNAVAILABLE", response.status);
      }

      return response;
    },
  };
}
