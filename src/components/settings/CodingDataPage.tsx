export function CodingDataPage(props: {
  codingDataOptIn: boolean | null; codingDataNote?: string; offerRestart?: boolean; restarting?: boolean;
  onSetCodingDataOptIn: (next: boolean) => void; onRestartAgent: () => void;
}) {
  const label = props.codingDataOptIn === null ? 'Unknown / native default' : props.codingDataOptIn ? 'Opted in' : 'Opted out';
  return <section className="settings-section"><div className="settings-row settings-row-stack"><div className="settings-row-text"><span className="settings-label">Native coding-data sharing: {label}</span><span className="settings-desc">Community does not change account privacy preferences. Open the official Grok CLI and use <code>/privacy</code> to inspect or change sharing. The setting also applies to other clients that use the same Grok home.</span>{props.codingDataNote && <span className="settings-desc">{props.codingDataNote}</span>}</div></div><button className="btn" onClick={()=>void window.grokDesktop.openInstallDocs()}>Official Grok documentation</button></section>;
}
