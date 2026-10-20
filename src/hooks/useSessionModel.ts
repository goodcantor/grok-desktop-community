import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { AvailableModel } from "../types/desktop";
import type { ReasoningEffort } from "../lib/reasoning-effort";

/** Owns session model selection and ignores responses from a replaced session. */
export function useSessionModel({
  sessionId,
  sessionIdRef,
  setError,
  setReasoningEffort,
}: {
  sessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  setError: (error: string | null) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
}) {
  /** Live session model from ACP (session/new|load). */
  const [modelId, setModelId] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const modelApplyLock = useRef(false);
  const modelApplyGen = useRef(0);
  // Model is session-scoped; drop the label when the agent/session goes away.
  useEffect(() => {
    if (!sessionId) {
      setModelId(null);
      setModelName(null);
      setAvailableModels([]);
    }
    modelApplyGen.current += 1;
    modelApplyLock.current = false;
  }, [sessionId]);

  const applyModel = useCallback(
    async (nextId: string) => {
      if (!nextId || nextId === modelId || modelApplyLock.current) return;
      const sessionAtStart = sessionIdRef.current;
      const gen = modelApplyGen.current;
      modelApplyLock.current = true;
      try {
        const result = await window.grokDesktop.setModel(nextId);
        if (
          gen !== modelApplyGen.current ||
          sessionAtStart !== sessionIdRef.current
        ) {
          return;
        }
        if (result.agentSynced === false) {
          setError(
            result.error
              ? `Could not switch model (${result.error}).`
              : "Could not switch model.",
          );
          return;
        }
        setModelId(result.modelId || nextId);
        setModelName(result.modelName || null);
        if (result.reasoningEffort) setReasoningEffort(result.reasoningEffort);
        if (Array.isArray(result.availableModels)) {
          setAvailableModels(result.availableModels);
        }
        setError(null);
      } catch (e: unknown) {
        if (
          gen !== modelApplyGen.current ||
          sessionAtStart !== sessionIdRef.current
        ) {
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to set model: ${msg}`);
      } finally {
        if (gen === modelApplyGen.current) {
          modelApplyLock.current = false;
        }
      }
    },
    [modelId, setError, setReasoningEffort],
  );

  return {
    modelId,
    modelName,
    availableModels,
    setModelId,
    setModelName,
    setAvailableModels,
    applyModel,
  };
}
