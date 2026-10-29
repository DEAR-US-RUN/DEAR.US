export const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'?';
export function dateLabel(value:string|Date,opts:Intl.DateTimeFormatOptions={month:'short',day:'numeric',year:'numeric'}){const date=new Date(value);const dateOnly=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat(undefined,dateOnly?{...opts,timeZone:'UTC'}:opts).format(date);}
export function relative(value:string){const diff=Date.now()-new Date(value).getTime();if(diff<0)return 'just now';const days=Math.floor(diff/86400000);if(days===0)return 'Today';if(days===1)return 'Yesterday';if(days<7)return `${days} days ago`;return dateLabel(value,{month:'short',day:'numeric'});}
export function bytes(value:number){if(value<1024)return `${value} B`;if(value<1048576)return `${(value/1024).toFixed(0)} KB`;return `${(value/1048576).toFixed(1)} MB`;}
export function reminder(d:{targetMode:string;targetDate:string|null;remainingDays:number|null;targetDuration:number|null}){
 if(d.targetMode==='duration'&&!d.targetDate)return `Starts when you both join`;
 if(!d.targetDate||d.remainingDays===null)return 'No target set';
 if(d.remainingDays>0)return `${d.remainingDays} days to go`;
 if(d.remainingDays===0)return 'Your reminder is today';
 return `${Math.abs(d.remainingDays)} days since your reminder`;
}
