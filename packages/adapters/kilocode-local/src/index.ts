export const type = "kilocode_local";
export const label = "KiloCode (local)";

export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# kilocode_local agent configuration

Adapter: kilocode_local

Use when:
- You want Paperclip to run Kilo Code locally as the agent runtime
- You want provider/model routing in Kilo format (provider/model)
- You want Kilo session resume across heartbeats via --session
- KiloCode is installed on the machine (npm install -g @kilocode/cli)

Don't use when:
- You need webhook-style external invocation (use openclaw_gateway or http)
- You only need one-shot shell commands (use process)
- Kilo CLI is not installed on the machine

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- model (string, required): Kilo model id in provider/model format (for example anthropic/claude-sonnet-4-5)
- variant (string, optional): thinking level (off, minimal, low, medium, high, xhigh)
- promptTemplate (string, optional): run prompt template
- command (string, optional): defaults to "kilo"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Kilo supports multiple providers and models. Use \`kilo models\` to list available options in provider/model format.
- Paperclip requires an explicit \`model\` value for \`kilocode_local\` agents.
- Runs are executed with: kilo run --auto --format json ...
- Sessions are resumed with --session when stored session cwd matches current cwd.
`;
