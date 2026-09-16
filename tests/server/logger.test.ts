import { describe, expect, it } from "vitest";
import { createLogger, redactForLog, type ServerLogRecord } from "../../server/logger";

describe("structured server logging", () => {
  it("redacts tokens, cookies, bodies, and error messages", () => {
    const secret = "Bearer not-for-logs";
    const record = redactForLog({
      authorization: secret,
      body: { prompt: "private corpus text" },
      prompt: "private elicitation answer",
      nested: { cookie: "session=private" },
      error: new Error("private upstream failure"),
    });

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("private corpus text");
    expect(serialized).not.toContain("private upstream failure");
    expect(serialized).not.toContain("private elicitation answer");
    expect(record).toEqual({
      authorization: "[REDACTED]",
      body: "[REDACTED]",
      prompt: "[REDACTED]",
      nested: { cookie: "[REDACTED]" },
      error: { name: "Error" },
    });
  });

  it("writes safe request fields at the configured level", () => {
    const writes: ServerLogRecord[] = [];
    const logger = createLogger("info", (_level, record) => writes.push(record));

    logger.debug("ignored", { event: "ignored", requestId: "req_1" });
    logger.info("request.completed", {
      event: "request.completed",
      requestId: "req_1",
      route: "/api/health/ready",
      status: 200,
    });

    expect(writes).toEqual([
      {
        event: "request.completed",
        requestId: "req_1",
        route: "/api/health/ready",
        status: 200,
      },
    ]);
  });
});
