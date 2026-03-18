import { parseKiloCodeStdoutLine, buildKiloCodeLocalConfig } from "@paperclipai/adapter-kilocode-local/ui";

export const kiloCodeLocalUIAdapter: UIAdapterModule = {
  type: "kilocode_local",
  buildConfig: buildKiloCodeLocalConfig,
  parseStdoutLine: parseKiloCodeStdoutLine,
  supportsLocalAgentJwt: true,
};
