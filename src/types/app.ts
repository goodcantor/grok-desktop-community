import type { AuthStatus } from "./auth";

export type AppInfo = {
  windowId: number;
  version: string;
  distribution: {channel: 'development' | 'unsigned-preview' | 'signed'; updates: 'manual' | 'verified'};
  platform: string;
  grokBinary: string;
  grokHome: string;
  userData: string;
  alwaysApprove: boolean;
  /** ask | auto | always-approve */
  permissionMode: "ask" | "auto" | "always-approve";
  /** Reasoning effort (`/effort`): low | medium | high | xhigh */
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  defaultReasoningEffort?: "low" | "medium" | "high" | "xhigh";
  /** When false (default), ACP fs + terminal cwd cannot leave project root */
  allowOutsideProject: boolean;
  /**
   * When true (default), ACP tool shells run in an OS FS jail
   * (Seatbelt / bwrap / WSL+bwrap / Docker).
   */
  sandboxTerminal: boolean;
  /** Human-readable backend probe for Settings */
  sandboxStatus: string;
  sandboxBackend: string;
  terminalIsolation: { requested: boolean; backend: string; effective: 'isolated' | 'host' | 'unavailable'; detail: string };
  /** UI appearance */
  theme: "dark" | "light";
  /**
   * Display-only: redact $HOME → ~ in the UI (screenshots / demos).
   * Does not change agent paths or on-disk data.
   */
  privacyMode: boolean;
  /**
   * Read-only native coding-data sharing. Null means unknown/native default.
   * Community never writes the native account preference.
   */
  codingDataOptIn: boolean | null;
  codingDataStatus?: {
    optedIn: boolean | null;
    source: "auth" | "default" | "none";
    managed: boolean;
    note?: string;
  };
  /** Diagnostic JSONL log for tools/hooks/terminals */
  debugLogging: boolean;
  debugLogPath: string;
  /** Always-on crash / exit JSONL (uncaughtException, renderer gone, quit) */
  crashLogPath: string;
  crashDumpsPath: string;
  /**
   * When true, Check for updates includes GitHub prereleases
   * (vX.Y.Z-beta.N). Default off.
   */
  allowPrerelease: boolean;
  /**
   * External editor for Files / Changes.
   * auto | cursor | code | code-insiders | zed | windsurf | subl | codium
   * | textedit | notepad
   */
  externalEditor: string;
  /** Call the agent compact API when last context size passes this mark. */
  autoCompactAt: "off" | "64k" | "128k" | "192k";
  recentProjects: string[];
  lastProject: string | null;
  home: string;
  defaultWorkspace: string;
  auth: AuthStatus;
};
