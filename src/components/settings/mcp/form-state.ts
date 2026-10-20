import type { McpServerInfo } from "../../../types/desktop";
import type { KvRow } from "./view-model";

export type McpFormState = {
  name: string;
  transport: "stdio" | "http" | "sse";
  command: string;
  argsText: string;
  url: string;
  projectScope: boolean;
  envRows: KvRow[];
  headerRows: KvRow[];
};

export function emptyMcpForm(): McpFormState {
  return {
    name: "",
    transport: "stdio",
    command: "",
    argsText: "",
    url: "",
    projectScope: false,
    envRows: [{ key: "", value: "" }],
    headerRows: [{ key: "", value: "" }],
  };
}

/** Inspect exposes secret names only; never hydrate credentials into the form. */
export function mcpFormForServer(server: McpServerInfo): McpFormState {
  const transport = String(server.transport || "").toLowerCase();
  return {
    name: server.name,
    transport:
      transport === "http" || transport === "sse" ? transport : "stdio",
    command: server.command || "",
    argsText: (server.args || []).join(" "),
    url: server.url || "",
    projectScope: server.scope === "project",
    envRows: server.envKeys?.length
      ? server.envKeys.map((key) => ({ key, value: "" }))
      : [{ key: "", value: "" }],
    headerRows: server.headerKeys?.length
      ? server.headerKeys.map((key) => ({ key, value: "" }))
      : [{ key: "", value: "" }],
  };
}
