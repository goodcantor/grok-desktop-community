import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuthStatus,
  BackboneSummary,
  LoginProgress,
} from "../types/desktop";
import { isMissingBinaryError } from "../lib/conn";

/** CLI-backed authentication; the renderer never stores credentials. */
export function useAuthentication({
  setError,
  confirmDiscardFiles,
  leaveProject,
  refreshBackbone,
  setBackbone,
  onAuthenticated,
}: {
  setError: (error: string | null) => void;
  confirmDiscardFiles: () => boolean;
  leaveProject: () => Promise<void>;
  refreshBackbone: (cwd?: string) => Promise<BackboneSummary>;
  setBackbone: (summary: BackboneSummary | null) => void;
  onAuthenticated: () => Promise<void>;
}) {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [loginProgress, setLoginProgress] = useState<LoginProgress | null>(
    null,
  );
  const [loginDeviceAuth, setLoginDeviceAuth] = useState(false);
  const loginGen = useRef(0);
  const refreshAuth = useCallback(async () => {
    const status = await window.grokDesktop.getAuthStatus();
    setAuth(status);
    return status;
  }, []);

  useEffect(() => {
    return window.grokDesktop.on("auth:login-progress", (payload) => {
      const next = (payload || {}) as LoginProgress;
      setLoginProgress(next);
      if (next.output) setAuthMessage(next.output);
    });
  }, []);

  const handleLogin = async (deviceAuth = false) => {
    const gen = ++loginGen.current;
    setAuthBusy(true);
    setLoginDeviceAuth(deviceAuth);
    setLoginProgress(null);
    setAuthMessage(
      deviceAuth
        ? "Starting device-code login…"
        : "Opening browser for Grok sign-in…",
    );
    setError(null);
    try {
      const result = await window.grokDesktop.login({ deviceAuth });
      if (gen !== loginGen.current) return;
      if (result.status) setAuth(result.status);
      if (result.output) setAuthMessage(result.output);
      if (result.ok || result.status?.authenticated) {
        setLoginProgress(null);
        setAuthMessage(result.output || "Signed in successfully.");
        await refreshBackbone();
        await onAuthenticated();
      } else if (result.error) {
        setAuthMessage(result.error);
        setError(result.error);
        if (isMissingBinaryError(result.error)) {
          await refreshAuth();
        }
      }
    } catch (e: unknown) {
      if (gen !== loginGen.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setAuthMessage(msg);
      setError(msg);
      if (isMissingBinaryError(msg)) {
        await refreshAuth();
      }
    } finally {
      if (gen === loginGen.current) {
        setAuthBusy(false);
        void refreshAuth();
      }
    }
  };

  const handleCancelLogin = async () => {
    loginGen.current += 1;
    await window.grokDesktop.cancelLogin();
    setAuthBusy(false);
    setLoginDeviceAuth(false);
    setLoginProgress(null);
    setAuthMessage("Login cancelled.");
    void refreshAuth();
  };

  const handleSubmitLoginCode = async (code: string) => {
    const result = await window.grokDesktop.submitLoginInput(code);
    if (result.ok) {
      setAuthMessage("Code sent. Waiting for Grok to finish sign-in…");
      return;
    }
    setAuthMessage(result.error || "Could not send the code.");
  };

  const handleLogout = async () => {
    if (!confirmDiscardFiles()) return;
    setAuthBusy(true);
    try {
      await leaveProject();
      const res = await window.grokDesktop.logout();
      if (res.status) setAuth(res.status);
      setAuthMessage(res.message || "Signed out");
      setBackbone(null);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSetApiKey = async (key: string) => {
    setAuthBusy(true);
    setError(null);
    try {
      const res = await window.grokDesktop.setApiKey(key);
      setAuth(res.status);
      if (res.ok) {
        setAuthMessage("API key set for this session.");
        await refreshBackbone();
      }
    } finally {
      setAuthBusy(false);
    }
  };

  return {
    auth,
    setAuth,
    authBusy,
    authMessage,
    loginProgress,
    loginDeviceAuth,
    refreshAuth,
    handleLogin,
    handleCancelLogin,
    handleSubmitLoginCode,
    handleLogout,
    handleSetApiKey,
  };
}
