/** A soft status hint, never a deadline or evidence that a turn has failed. */
export function longTurnStatus(run, now = Date.now()) {
  if (!run?.active || run.startedAt == null) return null;
  if (run.cancelRequestedAt != null && now - run.cancelRequestedAt >= 15_000) return {
    message:'Stop requested. The engine has not confirmed completion yet. You can restart it; completed actions are kept and your message will not be replayed.',
    canRestart:true,
  };
  const elapsed = now - run.startedAt;
  const silent = now - (run.lastActivityAt ?? run.startedAt);
  if (run.waitingPermissions > 0 && (silent >= 300_000 || elapsed >= 1_800_000)) {
    return {message:'Grok is waiting for your approval or answer. Check the pending request to continue.',canRestart:false};
  }
  if (silent >= 300_000) return {
    message:`No new engine activity for ${Math.floor(silent / 60_000)} min. Grok may still be thinking. You can use Stop or restart the engine; your message will not be replayed.`,
    canRestart:true,
  };
  if (elapsed >= 1_800_000) return {message:`Long task running for ${Math.floor(elapsed / 60_000)} min. Engine activity is still being received. Stop and Queue remain available.`,canRestart:false};
  return null;
}
