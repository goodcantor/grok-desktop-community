export function terminalIsolationStatus(requested, probe) {
  const isolated = requested && probe.available && !['win-host','none'].includes(probe.backend);
  return { requested: Boolean(requested), backend: requested ? probe.backend : 'host', effective: !requested ? 'host' : isolated ? 'isolated' : 'unavailable', detail: !requested ? 'Host shell with your user account privileges' : probe.detail };
}
