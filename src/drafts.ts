import { api,post,ApiError } from './api';
import { decryptContent,encryptContent } from './crypto';
import type { Attachment,Ciphertext,Draft,EntryContent } from './types';
export type DraftSnapshot=EntryContent & {forVault:boolean};
type EntryType='text'|'photo'|'video'|'voice'|'media';
type SaveInput={operationId:string;expectedVersion:number;ciphertext:Ciphertext;entryType:EntryType;forVault:boolean;attachmentIds:string[]};
type Pending={input:SaveInput;snapshot:Ciphertext};
type Backup={v:1;updatedAt:number;baseVersion:number;draftId:string|null;ciphertext:Ciphertext;forVault:boolean;entryType:EntryType;attachmentIds:string[];pending?:Pending;publish?:{requestId:string;draftId:string;expectedVersion:number}};
export type DraftStatus='loading'|'idle'|'saved'|'typing'|'saving'|'error'|'conflict';
export type DraftView={snapshot:DraftSnapshot;status:DraftStatus;message:string;recoverable:boolean;version:number;publishPending:boolean};
const empty=():DraftSnapshot=>({title:'',body:'',attachments:[],forVault:false});
export function entryType(attachments:Attachment[]):EntryType{
 if(!attachments.length)return 'text';const types=new Set(attachments.map(a=>a.mime.startsWith('image/')?'photo':a.mime.startsWith('video/')?'video':a.mime.startsWith('audio/')?'voice':'media'));
 return types.size===1?[...types][0] as EntryType:'media';
}
/** Serializes writes, uses version CAS and stable operation IDs, and persists only ciphertext locally. */
export class DraftManager {
 private snapshot=empty();private version=0;private draftId:string|null=null;private sequence=0;private serverSequence=0;private localSequence=0;
 private pending:Pending|undefined;private timer:ReturnType<typeof setTimeout>|undefined;private inFlight:Promise<number>|null=null;
 private status:DraftStatus='loading';private message='';private listeners=new Set<(view:DraftView)=>void>();
 private readonly storagePrefix:string;private readonly localKey:string;private recoveredKey:string|null=null;private recoveredAt=0;
 private disposed=false;private publishAttempt:Backup['publish'];
 constructor(private diaryId:string,private uid:string,private key:CryptoKey,private onRecoveredPublish:()=>void){
  this.storagePrefix=`dear-us:draft:${uid}:${diaryId}:`;this.localKey=this.storagePrefix+crypto.randomUUID();
 }
 subscribe(fn:(view:DraftView)=>void){this.listeners.add(fn);fn(this.view());return()=>{this.listeners.delete(fn);};}
 getSnapshot():DraftSnapshot{return this.snapshot;}
 private view():DraftView{return {snapshot:this.snapshot,status:this.status,message:this.message,recoverable:this.sequence<=this.localSequence||this.sequence<=this.serverSequence,version:this.version,publishPending:!!this.publishAttempt};}
 private emit(){if(!this.disposed){const v=this.view();this.listeners.forEach(fn=>fn(v));}}
 private restoreBackups():{key:string;value:Backup}|null{
  const candidates:{key:string;value:Backup}[]=[];
  try {for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith(this.storagePrefix))continue;try{const value=JSON.parse(localStorage.getItem(k)||'') as Backup;if(value.v===1&&value.ciphertext&&typeof value.updatedAt==='number')candidates.push({key:k,value});}catch{/* Ignore malformed cache entries. */}}}catch{return null;}
  return candidates.sort((a,b)=>b.value.updatedAt-a.value.updatedAt)[0]||null;
 }
 async init(){
  const local=this.restoreBackups();
  try {
   // Read and decrypt the local recovery copy first, even if the network is offline.
   if(local){
    const content=await decryptContent<EntryContent>(this.key,this.diaryId,this.uid,local.value.ciphertext);
    this.snapshot={...content,attachments:Array.isArray(content.attachments)?content.attachments:[],forVault:local.value.forVault};
    this.sequence=1;this.localSequence=1;this.version=local.value.baseVersion;this.draftId=local.value.draftId||null;this.pending=local.value.pending;this.publishAttempt=local.value.publish;
    this.recoveredKey=local.key;this.recoveredAt=local.value.updatedAt;
    this.status='error';this.message=this.publishAttempt?'A previous publish could not be confirmed. Retry it or keep your recovered copy.':'Recovered unsent changes from this device. Retry saving when you are ready.';this.emit();
   }
   const remote=await api<{draft:Draft|null}>(`/diaries/${this.diaryId}/draft`);if(this.disposed)return;
   if(local?.value.publish){
    // The user explicitly confirmed earlier; a stable request ID safely resolves an ambiguous response.
    try{await post(`/diaries/${this.diaryId}/entries`,{...local.value.publish,confirm:true});localStorage.removeItem(local.key);this.onRecoveredPublish();return;}
    catch{/* Preserve the encrypted recovery copy and allow the user to resolve it. */}
   }
   if(local){
    if(!this.pending && !this.publishAttempt && (remote.draft?.version||0)!==this.version){this.status='conflict';this.message='A saved draft changed elsewhere. Your encrypted local copy is preserved; review it before replacing the server draft.';}
   }else if(remote.draft){
    const content=await decryptContent<EntryContent>(this.key,this.diaryId,this.uid,remote.draft.ciphertext);
    this.snapshot={...content,attachments:Array.isArray(content.attachments)?content.attachments:[],forVault:remote.draft.forVault};this.version=remote.draft.version;this.draftId=remote.draft.id;this.status='saved';
   }else this.status='idle';
  }catch(e){this.status='error';this.message=local?'Offline or unable to reach the service. Your encrypted local copy is available.':(e instanceof Error?e.message:'Could not load your draft.');}
  this.emit();
 }
 change(next:DraftSnapshot){
  if(this.status==='loading')return;
  if(this.publishAttempt)return;
  this.snapshot=next;this.sequence++;
  if(this.status!=='conflict'){this.status='typing';this.message='';}
  this.emit();void this.backup();
  if(this.timer)clearTimeout(this.timer);
  if(this.status!=='conflict')this.timer=setTimeout(()=>void this.save().catch(()=>{}),750);
 }
 private async backup(){
  const seq=this.sequence;const snap=this.snapshot;
  try {
   const ciphertext=await encryptContent(this.key,this.diaryId,this.uid,{title:snap.title,body:snap.body,attachments:snap.attachments});
   if(seq!==this.sequence||this.disposed||(seq<=this.serverSequence&&!this.pending&&!this.publishAttempt))return;
   const data:Backup={v:1,updatedAt:Date.now(),baseVersion:this.version,draftId:this.draftId,ciphertext,forVault:snap.forVault,entryType:entryType(snap.attachments),attachmentIds:snap.attachments.map(a=>a.id),...(this.pending?{pending:this.pending}:{}),...(this.publishAttempt?{publish:this.publishAttempt}:{})};
   localStorage.setItem(this.localKey,JSON.stringify(data));this.localSequence=seq;this.emit();
  }catch {this.message='Local recovery is unavailable on this device. Keep this page open until your draft saves.';this.emit();}
 }
 private clearSavedBackups(){
  try{localStorage.removeItem(this.localKey);if(this.recoveredKey){const old=JSON.parse(localStorage.getItem(this.recoveredKey)||'null') as Backup|null;if(old?.updatedAt===this.recoveredAt)localStorage.removeItem(this.recoveredKey);}this.recoveredKey=null;}catch{/* No plaintext was stored. */}
 }
 async save():Promise<number>{
  if(this.status==='conflict')throw new Error('Resolve the draft conflict before saving.');
  if(this.inFlight){await this.inFlight;if(this.sequence>this.serverSequence||this.pending)return this.save();return this.version;}
  if(this.sequence<=this.serverSequence&&!this.pending)return this.version;
  this.inFlight=this.saveOnce();
  try {const result=await this.inFlight;this.inFlight=null;if(this.sequence>this.serverSequence||this.pending)return this.save();return result;}
  catch(e){this.inFlight=null;throw e;}
 }
 private async saveOnce():Promise<number>{
  this.status='saving';this.message='';this.emit();
  try{
   if(!this.pending){
    const snap=this.snapshot;
    const ciphertext=await encryptContent(this.key,this.diaryId,this.uid,{title:snap.title,body:snap.body,attachments:snap.attachments});
    this.pending={input:{operationId:crypto.randomUUID(),expectedVersion:this.version,ciphertext,entryType:entryType(snap.attachments),forVault:snap.forVault,attachmentIds:snap.attachments.map(a=>a.id)},snapshot:ciphertext};
   }
   const pending=this.pending;
   await this.backup(); // Retain the exact operation ID for safe retries if the response is lost.
   const result=await api<{draftId:string;version:number;currentVersion:number}>(`/diaries/${this.diaryId}/draft`,{method:'PUT',body:JSON.stringify(pending.input)});
   if(result.currentVersion!==result.version)throw new ApiError('DRAFT_CONFLICT','This draft changed in another tab. Your local copy is still available.',409);
   this.version=result.version;this.draftId=result.draftId;
   const sent=await decryptContent<EntryContent>(this.key,this.diaryId,this.uid,pending.snapshot);
   const now={title:this.snapshot.title,body:this.snapshot.body,attachments:this.snapshot.attachments};
   if(JSON.stringify(sent)===JSON.stringify(now)&&pending.input.forVault===this.snapshot.forVault)this.serverSequence=this.sequence;
   this.pending=undefined;
   if(this.serverSequence===this.sequence){this.status='saved';this.message='';this.clearSavedBackups();}
   else {this.status='typing';await this.backup();}
   this.emit();return this.version;
  }catch(e){
   this.status=e instanceof ApiError && ['DRAFT_CONFLICT','DRAFT_REPLACED'].includes(e.code)?'conflict':'error';
   this.message=e instanceof Error?e.message:'Draft couldn’t be saved. Your text is still available to retry.';
   await this.backup();this.emit();throw e;
  }
 }
 async retry(){
  if(this.publishAttempt){
   try {await post(`/diaries/${this.diaryId}/entries`,{...this.publishAttempt,confirm:true});this.clearSavedBackups();this.publishAttempt=undefined;this.onRecoveredPublish();return;}
   catch(e){
    if(e instanceof ApiError && e.status===409){this.publishAttempt=undefined;this.status='conflict';this.message='The publish could not complete because the draft changed or was replaced. Your encrypted copy is preserved; review it before starting a new draft.';await this.backup();this.emit();}
    throw e;
   }
  }
  await this.save();
 }
 async rebase(){
  const remote=await api<{draft:Draft|null}>(`/diaries/${this.diaryId}/draft`);this.version=remote.draft?.version||0;this.draftId=remote.draft?.id||null;this.pending=undefined;this.publishAttempt=undefined;this.status='typing';this.message='';this.sequence++;await this.backup();this.emit();return this.save();
 }
 async publish(requestId:string){
  if(this.publishAttempt){
   const result=await post<{entry:{id:string}}>(`/diaries/${this.diaryId}/entries`,{...this.publishAttempt,confirm:true});
   this.clearSavedBackups();this.publishAttempt=undefined;return result;
  }
  const version=await this.save();if(!version)throw new Error('Write something and save your draft before publishing.');
  if(!this.draftId)throw new Error('The saved draft identifier is unavailable. Please retry.');
  this.publishAttempt={requestId,draftId:this.draftId,expectedVersion:version};await this.backup();
  const result=await post<{entry:{id:string}}>(`/diaries/${this.diaryId}/entries`,{...this.publishAttempt,confirm:true});
  this.clearSavedBackups();this.publishAttempt=undefined;return result;
 }
 canLeave(){return this.sequence<=this.serverSequence||this.sequence<=this.localSequence;}
 dispose(){this.disposed=true;if(this.timer)clearTimeout(this.timer);this.listeners.clear();}
}
