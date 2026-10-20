import {useEffect,useState} from 'react';

export function NotificationSettings() {
  const [preferences,setPreferences]=useState<{enabled:boolean;sound:boolean;supported:boolean}|null>(null),[pending,setPending]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let live=true;void window.grokDesktop.notificationPreferences().then(value=>{if(live)setPreferences(value);}).catch(()=>{if(live)setError('Restart the application to load notification settings.');});return()=>{live=false;};},[]);
  const update=async(patch:{enabled?:boolean;sound?:boolean})=>{
    setPending(true);setError('');try{setPreferences(await window.grokDesktop.notificationPreferences(patch));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setPending(false);}
  };
  return <div className="notification-settings">
    <label className="settings-row"><div className="settings-row-text"><span className="settings-label">Desktop notifications</span><span className="settings-desc">When this window is in the background, notify when a response finishes, fails or needs your input. Click the alert to return to its window. Message content and commands stay out of alerts.</span></div><input type="checkbox" aria-label="Desktop notifications" checked={preferences?.enabled??false} disabled={!preferences||!preferences.supported||pending} onChange={e=>void update({enabled:e.target.checked})}/></label>
    <label className="settings-row"><div className="settings-row-text"><span className="settings-label">Notification sound</span><span className="settings-desc">Use the system notification sound. Windows Do not disturb can suppress banners and sounds.</span></div><input type="checkbox" aria-label="Notification sound" checked={preferences?.sound??false} disabled={!preferences?.enabled||!preferences.supported||pending} onChange={e=>void update({sound:e.target.checked})}/></label>
    {preferences&&!preferences.supported&&<p className="settings-desc">Native notifications are unavailable on this system.</p>}{error&&<p className="history-error" role="alert">{error}</p>}
  </div>;
}
