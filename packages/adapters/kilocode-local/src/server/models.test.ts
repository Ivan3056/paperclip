import { afterEach, describe, expect, it } from "vitest";
import {
  ensureKiloCodeModelConfiguredAndAvailable,
  listKiloCodeModels,
  resetKiloCodeModelsCacheForTests,
} from "./models.js";

describe("kiloCode models", () => {
  afterEach(() => {
    delete process.env.PAPERCLIP_KILOCODE_COMMAND;
    resetKiloCodeModelsCacheForTests();
  });

  it("returns an empty list when discovery command is unavailable", async () => {
    process.env.PAPERCLIP_KILOCODE_COMMAND = "__paperclip_missing_kilocode_command__";
    await expect(listKiloCodeModels()).resolves.toEqual([]);
  });

  it("rejects when model is missing", async () => {
    await expect(
      ensureKiloCodeModelConfiguredAndAvailable({ model: "" }),
    ).rejects.toThrow("KiloCode requires `adapterConfig.model`");
  });

  it("rejects when discovery cannot run for configured model", async () => {
    process.env.PAPERCLIP_KILOCODE_COMMAND = "__paperclip_missing_kilocode_command__";
    await expect(
      ensureKiloCodeModelConfiguredAndAvailable({
        model: "openai/gpt-5.2",
      }),
    ).rejects.toThrow("Failed to start command");
  });
});
