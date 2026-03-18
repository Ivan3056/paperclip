import { describe, expect, it } from "vitest";
import { parseKiloCodeJsonl, isKiloCodeUnknownSessionError } from "./parse.js";

describe("parseKiloCodeJsonl", () => {
  it("parses assistant text, usage, cost, and errors", () => {
    const stdout = [
      JSON.stringify({
        type: "text",
        sessionID: "session_123",
        part: { text: "Hello from KiloCode" },
      }),
      JSON.stringify({
        type: "step_finish",
        sessionID: "session_123",
        part: {
          reason: "done",
          cost: 0.0025,
          tokens: {
            input: 120,
            output: 40,
            reasoning: 10,
            cache: { read: 20, write: 0 },
          },
        },
      }),
      JSON.stringify({
        type: "error",
        sessionID: "session_123",
        error: { message: "model unavailable" },
      }),
    ].join("\n");

    const parsed = parseKiloCodeJsonl(stdout);
    expect(parsed.sessionId).toBe("session_123");
    expect(parsed.summary).toBe("Hello from KiloCode");
    expect(parsed.usage).toEqual({
      inputTokens: 120,
      cachedInputTokens: 20,
      outputTokens: 50,
    });
    expect(parsed.costUsd).toBeCloseTo(0.0025, 6);
    expect(parsed.errorMessage).toContain("model unavailable");
  });

  it("detects unknown session errors", () => {
    expect(isKiloCodeUnknownSessionError("Session not found: s_123", "")).toBe(true);
    expect(isKiloCodeUnknownSessionError("", "unknown session id")).toBe(true);
    expect(isKiloCodeUnknownSessionError("all good", "")).toBe(false);
  });
});
