import { asString } from "@paperclipai/adapter-utils/server-utils";

export function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

export function normalizeEnv(input: unknown): Record<string, string> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

export function resolveKiloCodeCommand(input: unknown): string {
  const envOverride =
    typeof process.env.PAPERCLIP_KILOCODE_COMMAND === "string" &&
    process.env.PAPERCLIP_KILOCODE_COMMAND.trim().length > 0
      ? process.env.PAPERCLIP_KILOCODE_COMMAND.trim()
      : "kilo";
  return asString(input, envOverride);
}
