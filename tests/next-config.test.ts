import { describe, expect, it } from "vitest";
import { parseAllowedDevOrigins } from "../next.config";

describe("development-origin configuration", () => {
  it("accepts and de-duplicates hostname-only entries", () => {
    expect(
      parseAllowedDevOrigins("172.20.10.4, *.preview.example.test,172.20.10.4"),
    ).toEqual(["172.20.10.4", "*.preview.example.test"]);
  });

  it("rejects schemes, ports, and paths", () => {
    expect(() => parseAllowedDevOrigins("http://172.20.10.4:3000")).toThrow(
      "DIG4EL_ALLOWED_DEV_ORIGINS",
    );
  });
});
