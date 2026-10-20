import { useCallback, useState } from "react";
import type { AppInfo } from "../types/desktop";
import {
  normalizeAutoCompactAt,
  type AutoCompactAt,
} from "../../shared/auto-compact.mjs";
import { applyTheme, readStoredTheme, storeTheme } from "../lib/theme";
import { readHideThinking, storeHideThinking } from "../lib/hide-thinking";

/** Hydration and persistence for display preferences, separate from agent access controls. */
export function useAppPreferences({
  setError,
}: {
  setError: (error: string | null) => void;
  appendSystem: (message: string) => void;
  offerRestart: () => void;
}) {
  const [theme, setTheme] = useState<"dark" | "light">(readStoredTheme);
  const [hideThinking, setHideThinking] = useState(readHideThinking);
  const [privacyMode, setPrivacyMode] = useState(false);
  /** Native read-only sharing state; no account default is chosen here. */
  const [codingDataOptIn, setCodingDataOptIn] = useState<boolean | null>(null);
  const [codingDataNote, setCodingDataNote] = useState<string | undefined>();
  const [debugLogging, setDebugLogging] = useState(false);
  const [debugLogPath, setDebugLogPath] = useState("");
  const [crashLogPath, setCrashLogPath] = useState("");
  const [allowPrerelease, setAllowPrerelease] = useState(false);
  const [autoCompactAt, setAutoCompactAt] = useState<AutoCompactAt>("off");
  const hydratePreferences = useCallback((i: AppInfo) => {
    setPrivacyMode(Boolean(i.privacyMode));
    setCodingDataOptIn(i.codingDataOptIn ?? null);
    setCodingDataNote(i.codingDataStatus?.note);
    setDebugLogging(Boolean(i.debugLogging));
    setDebugLogPath(i.debugLogPath || "");
    setCrashLogPath(i.crashLogPath || "");
    setAllowPrerelease(Boolean(i.allowPrerelease));
    setAutoCompactAt(normalizeAutoCompactAt(i.autoCompactAt));
    const nextTheme = i.theme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const applyAutoCompactAt = async (next: AutoCompactAt) => {
    setAutoCompactAt(next);
    try {
      const value = await window.grokDesktop.setAutoCompactAt(next);
      setAutoCompactAt(normalizeAutoCompactAt(value));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to save auto-compress setting");
    }
  };

  const setAppTheme = async (next: "dark" | "light") => {
    if (next === theme) return;
    applyTheme(next);
    setTheme(next);
    storeTheme(next);
    await window.grokDesktop.setTheme(next);
  };

  const applyPrivacyMode = async (next: boolean) => {
    if (next === privacyMode) return;
    setPrivacyMode(next);
    try {
      const value = await window.grokDesktop.setPrivacyMode(next);
      setPrivacyMode(Boolean(value));
    } catch (e: unknown) {
      setPrivacyMode(!next);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to set privacy mode");
    }
  };

  const applyCodingDataOptIn = async (_next: boolean) => {
    setError('Use /privacy in the official Grok CLI to change account sharing.');
  };

  const applyAllowPrerelease = async (next: boolean) => {
    if (next === allowPrerelease) return;
    if (
      next &&
      !window.confirm(
        "Preview updates can install untested prerelease builds.\n\nThe rest of the team stays on stable unless they turn this on too.\n\nAfter you turn this on, use Help → Check for updates.",
      )
    ) {
      return;
    }
    setAllowPrerelease(next);
    try {
      const stored = await window.grokDesktop.setAllowPrerelease(next);
      setAllowPrerelease(Boolean(stored));
    } catch (e: unknown) {
      setAllowPrerelease(!next);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to set preview updates");
    }
  };

  const applyDebugLogging = async (next: boolean) => {
    if (next === debugLogging) return;
    setDebugLogging(next);
    try {
      const res = await window.grokDesktop.setDebugLogging(next);
      setDebugLogging(Boolean(res.debugLogging));
      setDebugLogPath(res.debugLogPath || "");
    } catch (e: unknown) {
      setDebugLogging(!next);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to set debug logging");
    }
  };

  const applyHideThinking = (next: boolean) => {
    setHideThinking(next);
    storeHideThinking(next);
  };
  return {
    theme,
    hideThinking,
    privacyMode,
    codingDataOptIn,
    codingDataNote,
    debugLogging,
    debugLogPath,
    crashLogPath,
    allowPrerelease,
    autoCompactAt,
    hydratePreferences,
    applyHideThinking,
    setAppTheme,
    applyPrivacyMode,
    applyCodingDataOptIn,
    applyDebugLogging,
    applyAllowPrerelease,
    applyAutoCompactAt,
  };
}
