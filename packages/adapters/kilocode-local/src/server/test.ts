import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  asStringArray,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { discoverKiloCodeModels, ensureKiloCodeModelConfiguredAndAvailable } from "./models.js";
import { parseKiloCodeJsonl } from "./parse.js";
import { firstNonEmptyLine, normalizeEnv, resolveKiloCodeCommand } from "./utils.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function summarizeProbeDetail(stdout: string, stderr: string, parsedError: string | null): string | null {
  const raw = parsedError?.trim() || firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const max = 240;
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

const KILOCODE_AUTH_REQUIRED_RE =
  /(?:auth(?:entication)?\s+required|api\s*key|invalid\s*api\s*key|not\s+logged\s+in|kilo\s+auth\s+login|free\s+usage\s+exceeded)/i;

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = resolveKiloCodeCommand(config.command);
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: false });
    checks.push({
      code: "kilocode_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "kilocode_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }

  const openaiKeyOverride = "OPENAI_API_KEY" in envConfig ? asString(envConfig.OPENAI_API_KEY, "") : null;
  if (openaiKeyOverride !== null && openaiKeyOverride.trim() === "") {
    checks.push({
      code: "kilocode_openai_api_key_missing",
      level: "warn",
      message: "OPENAI_API_KEY override is empty.",
      hint: "The OPENAI_API_KEY override is empty. Set a valid key or remove override.",
    });
  }

  const runtimeEnv = normalizeEnv(ensurePathInEnv({ ...process.env, ...env }));

  const cwdInvalid = checks.some((check) => check.code === "kilocode_cwd_invalid");
  if (cwdInvalid) {
    checks.push({
      code: "kilocode_command_skipped",
      level: "warn",
      message: "Skipped command check because working directory validation failed.",
      detail: command,
    });
  } else {
    try {
      await ensureCommandResolvable(command, cwd, runtimeEnv);
      checks.push({
        code: "kilocode_command_resolvable",
        level: "info",
        message: `Command is executable: ${command}`,
      });
    } catch (err) {
      checks.push({
        code: "kilocode_command_unresolvable",
        level: "error",
        message: err instanceof Error ? err.message : "Command is not executable",
        detail: command,
      });
    }
  }

  const canRunProbe =
    checks.every((check) => check.code !== "kilocode_cwd_invalid" && check.code !== "kilocode_command_unresolvable");

  let modelValidationPassed = false;
  const configuredModel = asString(config.model, "").trim();

  if (canRunProbe && configuredModel) {
    try {
      const discovered = await discoverKiloCodeModels({ command, cwd, env: runtimeEnv });
      if (discovered.length > 0) {
        checks.push({
          code: "kilocode_models_discovered",
          level: "info",
          message: `Discovered ${discovered.length} model(s) from KiloCode providers.`,
        });
      } else {
        checks.push({
          code: "kilocode_models_empty",
          level: "error",
          message: "KiloCode returned no models.",
          hint: `Run \`${command} models\` and verify provider authentication.`,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/ProviderModelNotFoundError/i.test(errMsg)) {
        checks.push({
          code: "kilocode_hello_probe_model_unavailable",
          level: "warn",
          message: "The configured model was not found by provider.",
          detail: errMsg,
          hint: `Run \`${command} models\` and choose an available provider/model ID.`,
        });
      } else {
        checks.push({
          code: "kilocode_models_discovery_failed",
          level: "error",
          message: errMsg || "KiloCode model discovery failed.",
          hint: `Run \`${command} models\` manually to verify provider auth and config.`,
        });
      }
    }
  } else if (canRunProbe && !configuredModel) {
    try {
      const discovered = await discoverKiloCodeModels({ command, cwd, env: runtimeEnv });
      if (discovered.length > 0) {
        checks.push({
          code: "kilocode_models_discovered",
          level: "info",
          message: `Discovered ${discovered.length} model(s) from KiloCode providers.`,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/ProviderModelNotFoundError/i.test(errMsg)) {
        checks.push({
          code: "kilocode_hello_probe_model_unavailable",
          level: "warn",
          message: "The configured model was not found by provider.",
          detail: errMsg,
          hint: `Run \`${command} models\` and choose an available provider/model ID.`,
        });
      } else {
        checks.push({
          code: "kilocode_models_discovery_failed",
          level: "warn",
          message: errMsg || "KiloCode model discovery failed (best-effort, no model configured).",
          hint: `Run \`${command} models\` manually to verify provider auth and config.`,
        });
      }
    }
  }

  const modelUnavailable = checks.some((check) => check.code === "kilocode_hello_probe_model_unavailable");
  if (!configuredModel && !modelUnavailable) {
  } else if (configuredModel && canRunProbe) {
    try {
      await ensureKiloCodeModelConfiguredAndAvailable({
        model: configuredModel,
        command,
        cwd,
        env: runtimeEnv,
      });
      checks.push({
        code: "kilocode_model_configured",
        level: "info",
        message: `Configured model: ${configuredModel}`,
      });
      modelValidationPassed = true;
    } catch (err) {
      checks.push({
        code: "kilocode_model_invalid",
        level: "error",
        message: err instanceof Error ? err.message : "Configured model is unavailable.",
          hint: `Run \`${command} models\` and choose a currently available provider/model ID.`,
      });
    }
  }

  if (canRunProbe && modelValidationPassed) {
    const extraArgs = (() => {
      const fromExtraArgs = asStringArray(config.extraArgs);
      if (fromExtraArgs.length > 0) return fromExtraArgs;
      return asStringArray(config.args);
    })();
    const variant = asString(config.variant, "").trim();
    const probeModel = configuredModel;

    const args = ["run", "--auto", "--format", "json"];
    args.push("--model", probeModel);
    if (variant) args.push("--variant", variant);
    if (extraArgs.length > 0) args.push(...extraArgs);

    try {
      const probe = await runChildProcess(
        `kilocode-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command,
        args,
        {
          cwd,
          env: runtimeEnv,
          timeoutSec: 60,
          graceSec: 5,
          stdin: "Respond with hello.",
          onLog: async () => {},
        },
      );

      const parsed = parseKiloCodeJsonl(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
      const authEvidence = `${parsed.errorMessage ?? ""}\n${probe.stdout}\n${probe.stderr}`.trim();

      if (probe.timedOut) {
        checks.push({
          code: "kilocode_hello_probe_timed_out",
          level: "warn",
          message: "KiloCode hello probe timed out.",
          hint: "Retry probe. If this persists, run KiloCode manually in this working directory.",
        });
      } else if ((probe.exitCode ?? 1) === 0 && !parsed.errorMessage) {
        const summary = parsed.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "kilocode_hello_probe_passed" : "kilocode_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "KiloCode hello probe succeeded."
            : "KiloCode probe ran but did not return `hello` as expected.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
          ...(hasHello
            ? {}
            : {
                hint: `Run \`${command} run --auto --format json\` manually and prompt \`Respond with hello\` to inspect output.`,
              }),
        });
      } else if (/ProviderModelNotFoundError/i.test(authEvidence)) {
        checks.push({
          code: "kilocode_hello_probe_model_unavailable",
          level: "warn",
          message: "The configured model was not found by provider.",
          ...(detail ? { detail } : {}),
          hint: `Run \`${command} models\` and choose an available provider/model ID.`,
        });
      } else if (KILOCODE_AUTH_REQUIRED_RE.test(authEvidence)) {
        checks.push({
          code: "kilocode_hello_probe_auth_required",
          level: "warn",
          message: "KiloCode is installed, but provider authentication is not ready.",
          ...(detail ? { detail } : {}),
          hint: `Run \`${command} auth login\` or set provider credentials, then retry probe.`,
        });
      } else {
        checks.push({
          code: "kilocode_hello_probe_failed",
          level: "error",
          message: "KiloCode hello probe failed.",
          ...(detail ? { detail } : {}),
          hint: `Run \`${command} run --auto --format json\` manually in this working directory to debug.`,
        });
      }
    } catch (err) {
      checks.push({
        code: "kilocode_hello_probe_failed",
        level: "error",
        message: "KiloCode hello probe failed.",
        detail: err instanceof Error ? err.message : String(err),
        hint: `Run \`${command} run --auto --format json\` manually in this working directory to debug.`,
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
