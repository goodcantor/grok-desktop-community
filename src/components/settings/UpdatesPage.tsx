import {useEffect,useState} from 'react';
import type {AppInfo} from '../../types/app';
export function UpdatesPage({allowPrerelease,onSetAllowPrerelease}:{allowPrerelease:boolean;onSetAllowPrerelease:(next:boolean)=>void}){
 const [distribution,setDistribution]=useState<AppInfo['distribution']|null>(null);
 useEffect(()=>{let live=true;void window.grokDesktop.getInfo().then(info=>{if(live)setDistribution(info.distribution);}).catch(()=>{});return()=>{live=false;};},[]);
 return <section className="settings-section"><h3>Desktop updates</h3>
 {distribution?.updates==='verified'?<><p>Updates come only from goodcantor/grok-desktop-community. Use Help → Check for updates. Download and installation require confirmation; active tasks and unsaved edits block installation.</p><label className="settings-row"><div className="settings-row-text"><span className="settings-label">Preview updates</span><span className="settings-desc">Include beta releases when checking for updates.</span></div><input type="checkbox" aria-label="Preview updates" checked={allowPrerelease} onChange={event=>onSetAllowPrerelease(event.target.checked)}/></label></>:<><p>{distribution?.channel==='unsigned-preview'?'Unsigned community preview':'Development build'} · Manual updates</p><p>This build has no verified publisher signature. Download the next installer from Community Releases, verify its checksum, finish active tasks and close Community before replacing it. Your native history and Community preferences are retained.</p></>}
 <button className="btn" onClick={()=>void window.grokDesktop.openExternal('https://github.com/goodcantor/grok-desktop-community/releases')}>Open Community Releases</button>
 <p>Grok engine updates remain in the Engine section. The official CLI owns your account, skills and conversations.</p></section>;
}
