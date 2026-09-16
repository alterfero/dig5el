import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { readyHealthResponse, liveHealthResponse } from "../server/health";
import { apiError, createRequestId, withRequestId } from "../server/http";
import { createLogger } from "../server/logger";
import type { RuntimeBindings } from "../server/runtime-env";

type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

type ImageBinding = {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
};

export interface Env extends RuntimeBindings {
  ASSETS: AssetBinding;
  IMAGES: ImageBinding;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = createRequestId();
    const startedAt = Date.now();
    const logger = createLogger(env.DIG4EL_LOG_LEVEL);

    try {
      let response: Response;
      if (url.pathname === "/api/health/live") {
        response = request.method === "GET"
          ? liveHealthResponse(requestId)
          : apiError("METHOD_NOT_ALLOWED", requestId);
      } else if (url.pathname === "/api/health/ready") {
        response = request.method === "GET"
          ? readyHealthResponse(env, requestId)
          : apiError("METHOD_NOT_ALLOWED", requestId);
      } else if (url.pathname.startsWith("/api/")) {
        response = apiError("NOT_FOUND", requestId);
      } else if (url.pathname === "/_vinext/image") {
        const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
        response = await handleImageOptimization(request, {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        }, allowedWidths);
      } else {
        response = await handler.fetch(request, env, ctx);
      }

      logger.info("request.completed", {
        durationMs: Date.now() - startedAt,
        event: "request.completed",
        method: request.method,
        requestId,
        route: url.pathname,
        status: response.status,
      });
      return withRequestId(response, requestId);
    } catch (error) {
      logger.error("request.failed", {
        durationMs: Date.now() - startedAt,
        error,
        event: "request.failed",
        method: request.method,
        requestId,
        route: url.pathname,
        status: 500,
      });
      return apiError("INTERNAL", requestId);
    }
  },
};

export default worker;
