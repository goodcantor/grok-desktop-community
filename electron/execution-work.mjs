/** Work that must survive a declined close/update, including between native goal turns. */
export function executionHasActiveWork(record){
 if(record.disposed)return false;
 if(record.queue?.running||record.agent?.getRunState?.().active)return true;
 if(['pendingPlanApprovals','pendingUserQuestions','pendingFolderTrust','pendingMcpElicits'].some(key=>record[key]?.size))return true;
 if(!record.agent?.ready)return false;
 return record.agent.goalState?.status==='active'||(record.backgroundTasks||[]).some(task=>['running','pending','in_progress'].includes(task.status));
}
