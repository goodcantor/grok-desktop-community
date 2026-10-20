import fs from "node:fs";
import path from "node:path";
import { normalizePermissionMode } from "../shared/permission-mode.mjs";
import {
  DEFAULT_REASONING_EFFORT,
  normalizeReasoningEffort,
} from "../shared/reasoning-effort.mjs";
import { normalizeAutoCompactAt } from "../shared/auto-compact.mjs";
import { normalizeExternalEditor } from "./open-editor.mjs";

/** UI preferences only. Native CLI authentication and conversations live in GROK_HOME. */
export function normalizeDesktopState(value) {
  const raw =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const state = {
    permissionMode: "ask",
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    allowOutsideProject: false,
    sandboxTerminal: true,
    theme: "dark",
    privacyMode: false,
    debugLogging: false,
    allowPrerelease: false,
    externalEditor: "auto",
    autoCompactAt: "off",
    lastProject: null,
    recentProjects: [],
    ...raw,
  };
  // Read the raw mode so a default "ask" cannot mask the legacy boolean.
  state.permissionMode = normalizePermissionMode(
    raw.permissionMode,
    Boolean(raw.alwaysApprove),
  );
  state.reasoningEffort = normalizeReasoningEffort(state.reasoningEffort);
  state.autoCompactAt = normalizeAutoCompactAt(state.autoCompactAt);
  state.externalEditor = normalizeExternalEditor(state.externalEditor);
  state.theme = state.theme === "light" ? "light" : "dark";
  for (const key of ["privacyMode", "debugLogging", "allowPrerelease"]) {
    state[key] = Boolean(state[key]);
  }
  state.recentProjects = Array.isArray(state.recentProjects)
    ? state.recentProjects.filter((cwd) => typeof cwd === "string" && cwd)
    : [];
  delete state.alwaysApprove;
  delete state.worktreeSources;
  return state;
}

/** Synchronous reads keep existing cross-window read/modify/write callers consistent. */
export function createDesktopStateStore(filePath) {
  function loadState() {
    try {
      return normalizeDesktopState(
        JSON.parse(fs.readFileSync(filePath, "utf8")),
      );
    } catch {
      return normalizeDesktopState(null);
    }
  }

  function saveState(state) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
      fs.renameSync(temporary, filePath);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  function rememberProjectSession(cwd, sessionId) {
    if (!cwd || !sessionId) return;
    const state = loadState();
    state.lastProject = cwd;
    state.recentProjects = [
      cwd,
      ...state.recentProjects.filter((p) => p !== cwd),
    ].slice(0, 12);
    state.sessionsByProject = { ...state.sessionsByProject, [cwd]: sessionId };
    saveState(state);
  }

  return { loadState, saveState, rememberProjectSession };
}
