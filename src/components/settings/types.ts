import type { AutoCompactAt } from "../../../shared/auto-compact.mjs";
import type { PermissionMode } from "../../lib/permission-mode";

export type SettingsPageId =
  | "chat"
  | "models"
  | "general"
  | "engine"
  | "agent"
  | "coding-data"
  | "mcp"
  | "plugins"
  | "skills"
  | "updates"
  | "diagnostics";

export type SettingsNavItem = {
  id: SettingsPageId;
  label: string;
};

export type SettingsNavGroup = {
  label: string;
  items: SettingsNavItem[];
};

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: "App",
    items: [
      { id: "general", label: "Appearance" },
      {id:"chat",label:"Chat"},
      {id:"models",label:"Models"},
      { id: "engine", label: "Engine" },
    ],
  },
  {
    label: "Access",
    items: [
      { id: "agent", label: "Permissions" },
      { id: "coding-data", label: "Coding data" },
    ],
  },
  {
    label: "Extensions",
    items: [
      { id: "mcp", label: "MCP" },
      { id: "plugins", label: "Plugins" },
      { id: "skills", label: "Skills" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { id: "updates", label: "Updates" },
      { id: "diagnostics", label: "Diagnostics" },
    ],
  },
];

export const PAGE_TITLES: Record<SettingsPageId, string> = {
  general: "Appearance",
  chat:"Chat",models:"Models",
  engine: "Engine",
  agent: "Safety",
  "coding-data": "Coding data",
  mcp: "MCP servers",
  plugins: "Plugins",
  skills: "Skills",
  updates: "Updates",
  diagnostics: "Diagnostics",
};

export function pageFromFocus(
  focus: "mcp" | "plugins" | "skills" | null | undefined,
): SettingsPageId {
  if (focus === "mcp" || focus === "plugins" || focus === "skills") return focus;
  return "general";
}

export type SettingsFocusSection = "mcp" | "plugins" | "skills" | null;

export type SettingsSharedProps = {
  hideThinking?:boolean;onHideThinking?:(value:boolean)=>void;
  theme: "dark" | "light";
  privacyMode: boolean;
  codingDataOptIn: boolean | null;
  codingDataNote?: string;
  permissionMode: PermissionMode;
  allowOutsideProject: boolean;
  sandboxTerminal: boolean;
  sandboxStatus: string;
  debugLogging: boolean;
  debugLogPath: string;
  crashLogPath: string;
  onOpenCrashLog: () => void;
  allowPrerelease: boolean;
  autoCompactAt: AutoCompactAt;
  onSetTheme: (theme: "dark" | "light") => void;
  onSetPrivacyMode: (next: boolean) => void;
  onSetCodingDataOptIn: (next: boolean) => void;
  onSetPermissionMode: (mode: PermissionMode) => void;
  onToggleAllowOutside: () => void;
  onSetSandboxTerminal: (next: boolean) => void;
  onSetDebugLogging: (next: boolean) => void;
  onSetAllowPrerelease: (next: boolean) => void;
  onSetAutoCompactAt: (next: AutoCompactAt) => void;
  onOpenDebugLog: () => void;
  onRestartAgent: () => void;
  onRestartAfterWrite?: () => Promise<void> | void;
  restarting?: boolean;
  offerRestart?: boolean;
  grokBinary?: string;
  hasProject?: boolean;
  skills?: Array<{ name: string; description?: string; source?: string }>;
  skillsError?: string | null;
  skillsLoading?: boolean;
  focusSection?: SettingsFocusSection;
};
