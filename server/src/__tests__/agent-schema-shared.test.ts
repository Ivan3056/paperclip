import { describe, expect, it } from "vitest";
import { AGENT_ADAPTER_TYPES, createAgentSchema } from "@paperclipai/shared";

describe("shared createAgentSchema", () => {
  it("accepts gemini_local when Gemini is exposed in the product", () => {
    expect(AGENT_ADAPTER_TYPES).toContain("gemini_local");

    const parsed = createAgentSchema.parse({
      name: "Gemini Agent",
      adapterType: "gemini_local",
    });

    expect(parsed.adapterType).toBe("gemini_local");
  });
});
