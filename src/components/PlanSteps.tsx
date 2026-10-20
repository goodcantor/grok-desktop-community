import {Circle,CircleCheck,LoaderCircle} from 'lucide-react';
import {usePrivacy} from '../lib/privacy-context';
import type {currentPlan} from '../../shared/activity-status.mjs';

export function PlanSteps({entries,label='Task progress'}:{entries:ReturnType<typeof currentPlan>;label?:string}) {
  const {redact}=usePrivacy();
  return <ol className="activity-plan-list" aria-label={label}>{entries.map((entry,i)=><li key={i} data-status={entry.status}>
    {entry.status==='completed'?<CircleCheck size={14} aria-hidden/>:entry.status==='in_progress'?<LoaderCircle size={14} className="ui-spin" aria-hidden/>:<Circle size={14} aria-hidden/>}
    <span>{redact(entry.content)}</span><span className="sr-only">{entry.status.replaceAll('_',' ')}</span>
  </li>)}</ol>;
}
