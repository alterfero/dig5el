import {
  inspectRuntimeEnv,
  readNodeRuntimeBindings,
  type RuntimeBindings,
} from "./runtime-env";

const localFallback = new URL("http://localhost:3000");

/**
 * Metadata uses the same pinned application origin as the server boundary.
 * It never derives a social URL from a request Host/forwarded-host header.
 */
export function metadataBaseFor(
  bindings: RuntimeBindings = readNodeRuntimeBindings(),
): URL {
  const runtime = inspectRuntimeEnv(bindings);
  return runtime.ready && runtime.config.appOrigin
    ? new URL(runtime.config.appOrigin.toString())
    : new URL(localFallback.toString());
}
