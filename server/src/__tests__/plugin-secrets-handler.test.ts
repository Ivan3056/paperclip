import { describe, expect, it } from "vitest";
import {
  parseSecretRef,
  extractSecretRefsFromConfig,
} from "../services/plugin-secrets-handler.js";

// ---------------------------------------------------------------------------
// parseSecretRef
// ---------------------------------------------------------------------------

describe("parseSecretRef", () => {
  const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";

  it("parses a bare UUID", () => {
    expect(parseSecretRef(SAMPLE_UUID)).toBe(SAMPLE_UUID);
  });

  it("parses a prefixed UUID (secret:<uuid>)", () => {
    expect(parseSecretRef(`secret:${SAMPLE_UUID}`)).toBe(SAMPLE_UUID);
  });

  it("parses an uppercase UUID", () => {
    const upper = SAMPLE_UUID.toUpperCase();
    expect(parseSecretRef(upper)).toBe(upper);
  });

  it("parses a prefixed uppercase UUID", () => {
    const upper = SAMPLE_UUID.toUpperCase();
    expect(parseSecretRef(`secret:${upper}`)).toBe(upper);
  });

  it("returns null for a bare name (not a UUID)", () => {
    expect(parseSecretRef("MY_API_KEY")).toBeNull();
  });

  it("returns null for a prefixed name (not a UUID)", () => {
    expect(parseSecretRef("secret:MY_API_KEY")).toBeNull();
  });

  it("returns null for a truncated UUID", () => {
    expect(parseSecretRef("550e8400-e29b")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseSecretRef("")).toBeNull();
  });

  it("returns null for prefix-only input (secret:)", () => {
    expect(parseSecretRef("secret:")).toBeNull();
  });

  it("returns null for excessively long input", () => {
    const long = "a".repeat(300);
    expect(parseSecretRef(long)).toBeNull();
  });

  it("returns null for a double-prefixed value", () => {
    // "secret:secret:..." strips one prefix → "secret:..." which is not a UUID
    expect(parseSecretRef(`secret:secret:${SAMPLE_UUID}`)).toBeNull();
  });

  it("strips exactly one secret: prefix from a valid UUID", () => {
    expect(parseSecretRef(`secret:${SAMPLE_UUID}`)).toBe(SAMPLE_UUID);
  });
});

// ---------------------------------------------------------------------------
// extractSecretRefsFromConfig
// ---------------------------------------------------------------------------

describe("extractSecretRefsFromConfig", () => {
  const UUID1 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const UUID2 = "11111111-2222-3333-4444-555555555555";

  it("returns empty set for null/undefined config", () => {
    expect(extractSecretRefsFromConfig(null)).toEqual(new Set());
    expect(extractSecretRefsFromConfig(undefined)).toEqual(new Set());
  });

  it("extracts UUIDs from annotated schema paths", () => {
    const config = { apiKeyRef: UUID1, name: "test" };
    const schema = {
      type: "object",
      properties: {
        apiKeyRef: { type: "string", format: "secret-ref" },
        name: { type: "string" },
      },
    };
    const refs = extractSecretRefsFromConfig(config, schema);
    expect(refs).toEqual(new Set([UUID1]));
  });

  it("extracts UUIDs from nested schema paths", () => {
    const config = { oauth: { clientSecretRef: UUID1 }, name: "test" };
    const schema = {
      type: "object",
      properties: {
        oauth: {
          type: "object",
          properties: {
            clientSecretRef: { type: "string", format: "secret-ref" },
          },
        },
        name: { type: "string" },
      },
    };
    const refs = extractSecretRefsFromConfig(config, schema);
    expect(refs).toEqual(new Set([UUID1]));
  });

  it("falls back to collecting all UUIDs when no schema provided", () => {
    const config = {
      apiKeyRef: UUID1,
      nested: { tokenRef: UUID2 },
      name: "not-a-uuid",
    };
    const refs = extractSecretRefsFromConfig(config);
    expect(refs).toEqual(new Set([UUID1, UUID2]));
  });

  it("falls back to collecting all UUIDs when schema has no secret-ref annotations", () => {
    const config = { ref: UUID1 };
    const schema = {
      type: "object",
      properties: { ref: { type: "string" } },
    };
    const refs = extractSecretRefsFromConfig(config, schema);
    expect(refs).toEqual(new Set([UUID1]));
  });

  it("ignores non-UUID strings in annotated fields", () => {
    const config = { apiKeyRef: "not-a-uuid" };
    const schema = {
      type: "object",
      properties: {
        apiKeyRef: { type: "string", format: "secret-ref" },
      },
    };
    const refs = extractSecretRefsFromConfig(config, schema);
    expect(refs.size).toBe(0);
  });

  it("handles arrays in fallback mode", () => {
    const config = { refs: [UUID1, UUID2, "plain"] };
    const refs = extractSecretRefsFromConfig(config);
    expect(refs).toEqual(new Set([UUID1, UUID2]));
  });
});
