/** Sanitized MCP row — env/header *values* never cross IPC. */
export type McpServerInfo = {
  name: string;
  displayName?: string | null;
  transport?: string | null;
  enabled?: boolean | null;
  scope?: string | null;
  command?: string | null;
  args?: string[];
  url?: string | null;
  envKeys?: string[];
  headerKeys?: string[];
  source?: string | null;
  /** True when ~/.grok/mcp_credentials.json has a token for this name. */
  signedIn?: boolean;
  /** Live TUI /mcps status: ready | initializing | unavailable | needs-auth | setup-required */
  liveStatus?:
    | "ready"
    | "initializing"
    | "unavailable"
    | "needs-auth"
    | "setup-required"
    | null;
  authRequired?: boolean;
  liveToolCount?: number | null;
};

export type McpAddSpec = {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Array<{ key: string; value: string }>;
  headers?: Array<{ name: string; value: string }>;
  scope?: "user" | "project";
};

export type McpListResult = {
  ok: boolean;
  servers: McpServerInfo[];
  source?: "list" | "inspect";
  error?: string | null;
  liveOk?: boolean;
};

export type McpWriteResult = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string | null;
};

export type McpDoctorCheck = {
  label: string;
  passed: boolean;
  detail: string | null;
};

export type McpDoctorServer = {
  name: string;
  transport: string | null;
  target: string | null;
  source: string | null;
  healthy: boolean;
  checks: McpDoctorCheck[];
  tools: string[];
  toolCount: number | null;
  needsAuth: boolean;
};

export type McpAuthResult = {
  ok: boolean;
  status?: string;
  serverName?: string;
  error?: string | null;
};

export type McpDoctorResult = {
  ok: boolean;
  healthyCount: number;
  failingCount: number;
  servers: McpDoctorServer[];
  stdout?: string;
  stderr?: string;
  error?: string | null;
};

/** Sanitized plugin row from `grok plugin list --json` (no component inventory). */
export type PluginInfo = {
  name: string;
  enabled?: boolean | null;
  status?: string | null;
  version?: string | null;
  description?: string | null;
  marketplace?: string | null;
  source?: string | null;
  skillCount?: number | null;
  hasHooks?: boolean | null;
  hasAgents?: boolean | null;
  hasMcp?: boolean | null;
};

export type PluginListResult = {
  ok: boolean;
  plugins: PluginInfo[];
  source?: "list" | "inspect";
  error?: string | null;
};

export type PluginWriteResult = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string | null;
};

export type BackboneSummary = {
  ok: boolean;
  skills: Array<{ name: string; description?: string; source?: string }>;
  mcpServers: Array<{
    name: string;
    transport?: string;
    source?: string;
  }>;
  plugins: Array<{ name: string }>;
  grokVersion?: string;
  error?: string;
};

export type SlashCommand = {
  name: string;
  description: string;
  source: "agent" | "skill" | "desktop";
  inputHint?: string;
  local?: boolean;
};
