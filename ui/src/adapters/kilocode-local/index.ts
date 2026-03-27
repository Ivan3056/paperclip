import type { UIAdapterModule } from "../types";
import { parseKiloCodeStdoutLine } from "@paperclipai/adapter-kilocode-local/ui";
import { KiloCodeLocalConfigFields } from "./config-fields";
import { buildKiloCodeLocalConfig } from "@paperclipai/adapter-kilocode-local/ui";

export const kiloCodeLocalUIAdapter: UIAdapterModule = {
  type: "kilocode_local",
  label: "KiloCode (local)",
  parseStdoutLine: parseKiloCodeStdoutLine,
  ConfigFields: KiloCodeLocalConfigFields,
  buildAdapterConfig: buildKiloCodeLocalConfig,
};
