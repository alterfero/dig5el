import assert from "node:assert/strict";
import test from "node:test";

const secret = "never-leak-plaid-service-token";

async function fetchWorker(path) {
  const workerUrl = new URL("../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: path.startsWith("/api/") ? "application/json" : "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      DIG4EL_ENVIRONMENT: "development",
      DIG4EL_LOG_LEVEL: "silent",
      PLAID_AUTH_MODE: "disabled",
      PLAID_SERVICE_TOKEN: secret,
    },
    {
      passThroughOnException() {},
      waitUntil() {},
    },
  );
}

test("built Worker exposes safe, no-store health checks", async () => {
  const [live, ready] = await Promise.all([
    fetchWorker("/api/health/live"),
    fetchWorker("/api/health/ready"),
  ]);

  assert.equal(live.status, 200);
  assert.equal(ready.status, 200);
  assert.match(live.headers.get("cache-control") ?? "", /no-store/i);
  assert.match(ready.headers.get("cache-control") ?? "", /no-store/i);

  const [liveBody, readyBody] = await Promise.all([live.text(), ready.text()]);
  assert.match(liveBody, /"status":"ok"/);
  assert.match(readyBody, /"status":"ready"/);
  assert.doesNotMatch(`${liveBody}${readyBody}`, new RegExp(secret));
});

test("built Worker renders the foundation without PLAID credentials", async () => {
  const response = await fetchWorker("/");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /DIG4EL/);
  assert.match(html, /Start with what you already know/i);
  assert.doesNotMatch(html, new RegExp(secret));
});

test("unknown API routes retain the safe error envelope", async () => {
  const response = await fetchWorker("/api/not-a-real-route");
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal(body.error.retryable, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(secret));
});
