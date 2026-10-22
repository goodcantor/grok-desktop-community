export function formatElapsed(ms:number):string;
export function currentTurnItems(items?:any[]):any[];
export function currentPlan(items?:any[], goal?:{goalId?:string|null;status?:string}|null):Array<{content:string;status:'completed'|'in_progress'|'pending'}>;
export function normalizePlanEntries(entries:unknown):ReturnType<typeof currentPlan>;
export function activityStatus(options:{run?:any;items?:any[];waitingFor?:string|null;permissionCount?:number;now?:number;startedAt?:number;cancelRequested?:boolean}):{phase:string;label:string;detail:string;elapsedMs:number;silentMs:number;toolCount:number};
export function goalElapsed(goal:any,now?:number,turnStartedAt?:number|null):number|null;
