/** The agent owns host-tool duration. Keep the historical hung-container
 * safety net for WSL/Docker, and honor an explicit administrator override. */
export function terminalTimeoutMs(backend,env=process.env) {
  const fallback=['docker','wsl-bwrap'].includes(backend)?900000:0;
  if(env.GROK_DESKTOP_TERMINAL_TIMEOUT_MS==null)return fallback;
  const value=Number(env.GROK_DESKTOP_TERMINAL_TIMEOUT_MS);
  return Number.isFinite(value)&&value>=0?value:fallback;
}
