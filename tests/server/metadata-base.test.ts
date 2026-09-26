import { describe, expect, it } from "vitest";
import { metadataBaseFor } from "../../server/metadata-base";

describe("metadata base", () => {
  it("uses the validated pinned application origin", () => {
    expect(
      metadataBaseFor({
        DIG4EL_APP_ORIGIN: "https://dig4el.example.test",
        DIG4EL_ENVIRONMENT: "production",
        PLAID_AUTH_MODE: "disabled",
      }).toString(),
    ).toBe("https://dig4el.example.test/");
  });

  it("uses a safe localhost fallback for an invalid runtime configuration", () => {
    expect(
      metadataBaseFor({
        DIG4EL_APP_ORIGIN: "https://attacker.example.test/path",
        DIG4EL_ENVIRONMENT: "production",
        PLAID_AUTH_MODE: "disabled",
      }).toString(),
    ).toBe("http://localhost:3000/");
  });
});
