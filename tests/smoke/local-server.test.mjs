import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const secret = "never-leak-plaid-service-token";
const port = 3200 + (process.pid % 400);
const origin = `http://127.0.0.1:${port}`;
const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const nextBinary = path.join(projectRoot, "node_modules/next/dist/bin/next");

let server;
let serverOutput = "";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next server exited before it was ready.\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${origin}/api/health/live`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Next server did not become ready.\n${serverOutput}`);
}

async function request(pathname, options = {}) {
  return fetch(`${origin}${pathname}`, options);
}

before(async () => {
  server = spawn(process.execPath, [nextBinary, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DIG4EL_APP_ORIGIN: "https://dig4el.example.test",
      DIG4EL_ENVIRONMENT: "production",
      DIG4EL_LOG_LEVEL: "silent",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production",
      PLAID_AUTH_MODE: "disabled",
      PLAID_SERVICE_TOKEN: secret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  await waitForServer();
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  await Promise.race([exited, delay(5_000)]);
});

test("local Node server exposes safe, no-store health checks", async () => {
  const [live, ready] = await Promise.all([
    request("/api/health/live"),
    request("/api/health/ready"),
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

test("local Node server renders the foundation without PLAID credentials", async () => {
  const response = await request("/", {
    headers: { "x-forwarded-host": "attacker.invalid" },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/i);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const html = await response.text();
  assert.match(html, /DIG4EL/);
  assert.match(html, /Supporting the creation of grammatical descriptions of endangered languages/i);
  assert.match(html, /https:\/\/dig4el\.example\.test\/og\.png/);
  assert.doesNotMatch(html, /attacker\.invalid\/og\.png/);
  assert.doesNotMatch(html, new RegExp(secret));
});

test("unknown API routes retain the safe error envelope", async () => {
  const response = await request("/api/not-a-real-route");
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal(body.error.retryable, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(secret));
});
