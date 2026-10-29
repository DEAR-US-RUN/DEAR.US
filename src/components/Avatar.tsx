import { initials } from '../format';
export function Avatar({name,avatar,tone='sage',size='normal'}:{name:string;avatar?:string|null;tone?:'sage'|'rose'|'cream';size?:'small'|'normal'|'large'}){
 // Only render Google's HTTPS avatar host; initials remain as a safe fallback.
 let allowed=false;try{const u=new URL(avatar||'');allowed=u.protocol==='https:'&&u.hostname.endsWith('.googleusercontent.com');}catch{}
 return <span className={`avatar avatar-${tone} avatar-${size}`} aria-label={name}>{allowed?<img src={avatar!} alt="" referrerPolicy="no-referrer"/>:initials(name)}</span>;
}
