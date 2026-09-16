import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep service and boundary helpers in their native runtime by default.
    // Component tests opt into JSDOM with a file-level Vitest directive.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
