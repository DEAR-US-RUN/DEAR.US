export interface User {id:string;uid:string;name:string;email:string|null;avatar:string|null;isOwner:boolean}
export interface Member {id:string;name:string;avatar:string|null;joinedAt:string;role:'owner'|'member'}
export interface Diary {
 id:string;title:string;kind:'personal'|'connected';relationshipLabel:string|null;otherName:string|null;
 targetMode:'none'|'date'|'duration';targetDuration:number|null;targetDate:string|null;remainingDays:number|null;
 createdAt:string;lastActivityAt:string;members:Member[];connectedAt:string|null;daysConnected:number|null;
 approvals:string[];unlockedAt:string|null;myEntryCount:number;myStorageBytes:number;streak:number;myId:string;
}
export interface Ciphertext {v:1;iv:string;data:string}
export interface PasswordEnvelope {v:1;kdf:'PBKDF2-SHA256';iterations:600000;salt:string;iv:string;data:string}
export interface Attachment {id:string;name:string;mime:string;size:number;iv:string}
export interface EntryContent {title:string;body:string;attachments:Attachment[]}
export interface Draft {id:string;version:number;ciphertext:Ciphertext;entryType:'text'|'photo'|'video'|'voice'|'media';forVault:boolean;attachmentIds:string[];updatedAt:string}
export interface Entry {id:string;entryType:string;ciphertext:Ciphertext;forVault:boolean;createdAt:string;authorId:string;authorUid:string;authorName:string;attachments:{id:string;iv:string;mime:string;size:number}[]}
