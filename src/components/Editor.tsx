import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { AlertCircle, Check, FileAudio, ImagePlus, LoaderCircle, Mic, Paperclip, RotateCw, ShieldCheck, StopCircle, Trash2, Video } from 'lucide-react';
import { DraftManager } from '../drafts';
import type { DraftSnapshot,DraftView } from '../drafts';
import type { Attachment,Diary } from '../types';
import { useAuth } from '../AuthContext';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { encryptMedia } from '../crypto';
import { post } from '../api';
import { bytes } from '../format';

type Upload={id:string;file:File;iv?:string;ciphertext?:ArrayBuffer;progress:number;state:'encrypting'|'uploading'|'error';error?:string};
const supported=['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','application/pdf'];
function sendFile(url:string,fields:Record<string,string>,ciphertext:ArrayBuffer,onProgress:(n:number)=>void){
 return new Promise<void>((resolve,reject)=>{
  const form=new FormData();Object.entries(fields).forEach(([k,v])=>form.append(k,v));form.append('file',new Blob([ciphertext],{type:'application/octet-stream'}),'encrypted.bin');
  const xhr=new XMLHttpRequest();xhr.open('POST',url);xhr.timeout=120000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('Upload failed. Please retry.'));
  xhr.onerror=xhr.ontimeout=()=>reject(new Error('Upload failed. Please retry.'));xhr.send(form);
 });
}
export function Editor({diary,diaryKey,onPublished,onClose}:{diary:Diary;diaryKey:CryptoKey;onPublished:()=>void;onClose:()=>void}){
 const {user}=useAuth();const {notify}=useToast();const uid=user!.uid;
 const manager=useMemo(()=>new DraftManager(diary.id,uid,diaryKey,()=>{notify('Entry published permanently.','success');onPublished();}),[diary.id,uid,diaryKey]);
 const [view,setView]=useState<DraftView>({snapshot:{title:'',body:'',attachments:[],forVault:false},status:'loading',message:'',recoverable:true,version:0,publishPending:false});
 const [publishing,setPublishing]=useState(false);const [confirm,setConfirm]=useState(false);const [uploads,setUploads]=useState<Upload[]>([]);const prepared=useRef(new Map<string,Upload>());const requestId=useRef(crypto.randomUUID());const fileRef=useRef<HTMLInputElement>(null);const mediaRecorder=useRef<MediaRecorder|null>(null);const recordingStream=useRef<MediaStream|null>(null);const [recording,setRecording]=useState(false);
 useEffect(()=>{const unsub=manager.subscribe(setView);void manager.init();return()=>{unsub();manager.dispose();recordingStream.current?.getTracks().forEach(t=>t.stop());};},[manager]);
 const blocker=useBlocker(()=>!manager.canLeave()||uploads.some(u=>u.state==='uploading'||u.state==='encrypting'));
 useEffect(()=>{
  function before(e:BeforeUnloadEvent){if(!manager.canLeave()||uploads.some(u=>u.state==='uploading'||u.state==='encrypting')){e.preventDefault();e.returnValue='';}}
  window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);
 },[manager,uploads]);
 function update(patch:Partial<DraftSnapshot>){manager.change({...manager.getSnapshot(),...patch});}
 function safeClose(){onClose();}
 function setUpload(id:string,patch:Partial<Upload>){setUploads(old=>old.map(u=>u.id===id?{...u,...patch}:u));const item=prepared.current.get(id);if(item)prepared.current.set(id,{...item,...patch});}
 async function upload(id:string){
  let u=prepared.current.get(id);if(!u)return;
  try{
   if(!u.ciphertext||!u.iv){setUpload(id,{state:'encrypting',error:undefined});const encrypted=await encryptMedia(diaryKey,diary.id,id,u.file);u={...u,...encrypted};prepared.current.set(id,u);}
   setUpload(id,{state:'uploading',progress:0,error:undefined});
   const r=await post<{id:string;state:string;post?:{url:string;fields:Record<string,string>}}>(`/diaries/${diary.id}/uploads`,{id,mime:u.file.type,size:u.file.size,iv:u.iv});
   if(r.state!=='ready'){
    if(!r.post)throw new Error('Upload service is unavailable.');
    await sendFile(r.post.url,r.post.fields,u.ciphertext!,n=>setUpload(id,{progress:n}));
    await post(`/uploads/${id}/complete`,{});
   }
   const attachment:Attachment={id,name:u.file.name,mime:u.file.type,size:u.file.size,iv:u.iv!};
   const current=manager.getSnapshot();manager.change({...current,attachments:[...current.attachments,attachment]});
   setUploads(old=>old.filter(x=>x.id!==id));prepared.current.delete(id);notify('Attachment uploaded.','success');
  }catch(e){setUpload(id,{state:'error',error:e instanceof Error?e.message:'Upload failed. Please retry.'});}
 }
 function addFiles(files:FileList|File[]){
  for(const file of Array.from(files)){
   const max=file.type.startsWith('image/')?10: file.type.startsWith('video/')?40:20;
   if(!supported.includes(file.type)||file.size===0||file.size>max*1024*1024){notify(`Unsupported file or file exceeds the ${max} MB limit.`,'error');continue;}
   if(manager.getSnapshot().attachments.length+prepared.current.size>=8){notify('A draft can contain up to 8 attachments.','warning');break;}
   const id=crypto.randomUUID(),u:Upload={id,file,state:'encrypting',progress:0};prepared.current.set(id,u);setUploads(old=>[...old,u]);void upload(id);
  }
 }
 async function record(){
  if(recording){mediaRecorder.current?.stop();setRecording(false);return;}
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Voice recording is not available in this browser.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});recordingStream.current=stream;
   const mime=['audio/webm','audio/mp4','audio/ogg'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime){stream.getTracks().forEach(t=>t.stop());throw new Error('This browser does not support a compatible recording format.');}
   const recorder=new MediaRecorder(stream,{mimeType:mime});mediaRecorder.current=recorder;const chunks:Blob[]=[];
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());recordingStream.current=null;const blob=new Blob(chunks,{type:mime});addFiles([new File([blob],`Voice note ${new Date().toISOString().slice(0,10)}.${mime.split('/')[1]}`,{type:mime})]);};
   recorder.start();setRecording(true);
  }catch(e){notify(e instanceof Error?e.message:'Microphone permission was not granted.','error');}
 }
 async function publish(){
  setPublishing(true);try{await manager.publish(requestId.current);setConfirm(false);notify('Entry published permanently.','success');onPublished();}
  catch(e){notify(e instanceof Error?e.message:'Could not publish. Your draft is still available.','error');}finally{setPublishing(false);}
 }
 const statusLabel={loading:'Loading draft…',idle:'Ready to write',typing:'Typing…',saving:'Saving draft…',saved:'Saved',error:'Couldn’t save',conflict:'Draft conflict'}[view.status];
 const hasContent=!!(view.snapshot.title.trim()||view.snapshot.body.trim()||view.snapshot.attachments.length);
 return <div className="editor-shell"><div className="editor-top"><div><span className="eyebrow">A PAGE JUST FOR YOU</span><h2>Let it out, keep it close.</h2><p>Take your time. Your words are yours.</p></div><div className={`save-status status-${view.status}`} aria-live="polite">{view.status==='saving'?<LoaderCircle size={14} className="spin"/>:view.status==='saved'?<Check size={14}/>:view.status==='error'||view.status==='conflict'?<AlertCircle size={14}/>:<span className="status-dot"/>}{statusLabel}</div></div>
  {view.message&&<div className={`editor-alert ${view.status==='conflict'?'editor-alert-warning':''}`} role="status"><span>{view.message}</span>{view.status==='conflict'?<button onClick={async()=>{if(window.confirm('Replace the current server draft with this recovered copy? If it was already published, this starts a new draft. Published entries will not change.'))try{await manager.rebase();notify('Draft saved.','success');}catch(e){notify(e instanceof Error?e.message:'Could not save the draft.','error');}}}>Use this copy</button>:<button onClick={()=>void manager.retry().then(()=>{if(!view.publishPending)notify('Draft saved.','success');}).catch(e=>notify(e.message,'error'))}><RotateCw size={14}/> Retry</button>}</div>}
  <div className="editor-paper"><label className="sr-only" htmlFor="entry-title">Entry title</label><input id="entry-title" className="editor-title" placeholder="Give this moment a title…" value={view.snapshot.title} maxLength={160} disabled={view.status==='loading'||publishing||view.publishPending} onChange={e=>update({title:e.target.value})}/><div className="paper-date">{new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date())}</div><label className="sr-only" htmlFor="entry-body">Your entry</label><textarea id="entry-body" className="editor-body" placeholder="Dear diary, today I’m feeling…" value={view.snapshot.body} maxLength={40000} disabled={view.status==='loading'||publishing||view.publishPending} onChange={e=>update({body:e.target.value})}/>
   {view.snapshot.attachments.length>0&&<div className="attached-list">{view.snapshot.attachments.map(a=><div className="attached-file" key={a.id}><Paperclip size={15}/><span>{a.name}<small>{bytes(a.size)}</small></span><button aria-label={`Remove ${a.name} from draft`} onClick={()=>update({attachments:manager.getSnapshot().attachments.filter(x=>x.id!==a.id)})}><Trash2 size={15}/></button></div>)}</div>}
   {uploads.map(u=><div key={u.id} className="upload-progress"><span><Paperclip size={14}/> {u.file.name}</span><small>{u.state==='encrypting'?'Encrypting…':u.state==='uploading'?`Uploading ${u.progress}%`:u.error}</small>{u.state==='error'&&<><button onClick={()=>void upload(u.id)}>Retry</button><button onClick={()=>{prepared.current.delete(u.id);setUploads(old=>old.filter(x=>x.id!==u.id));}}>Remove</button></>}</div>)}
   <div className="editor-tools"><div><input ref={fileRef} className="sr-only" type="file" multiple accept={supported.join(',')} onChange={e=>{if(e.target.files)addFiles(e.target.files);e.target.value='';}}/><button title="Attach files" onClick={()=>fileRef.current?.click()} disabled={publishing||view.publishPending}><ImagePlus size={17}/> Add media</button><button onClick={()=>void record()} disabled={publishing||view.publishPending}>{recording?<StopCircle size={17}/>:<Mic size={17}/>} {recording?'Stop recording':'Voice note'}</button></div><span>{view.snapshot.body.trim()?view.snapshot.body.trim().split(/\s+/).length:0} words</span></div>
  </div>
  <p className="media-hint"><FileAudio size={14}/> Photos up to 10 MB, video up to 40 MB, audio/PDF up to 20 MB. Up to 8 files; encrypted before upload.</p>
  {diary.kind==='connected'&&!diary.unlockedAt&&<label className="vault-toggle"><input type="checkbox" disabled={view.publishPending} checked={view.snapshot.forVault} onChange={e=>update({forVault:e.target.checked})}/><span className="vault-toggle-icon"><LockKeyholeMini/></span><span><strong>Save this entry for the Feelings Vault</strong><small>It remains private until both of you approve the shared reveal.</small></span></label>}
  {diary.unlockedAt&&<p className="field-help">The vault has already been revealed. New entries are private and cannot be added to that reveal.</p>}
  <div className="editor-footer"><p><ShieldCheck size={15}/> Your draft is encrypted and saves automatically.</p><div><button className="button button-ghost" onClick={safeClose}>Close editor</button><button className="button button-primary" disabled={!hasContent||publishing||view.status==='loading'||view.publishPending||uploads.length>0} onClick={()=>setConfirm(true)}>Publish entry <span>→</span></button></div></div>
  {blocker.state==='blocked'&&<Modal title="Leave this page?" subtitle="Your latest change or upload is not yet recoverable." onClose={()=>blocker.reset()}><div className="confirmation-copy"><p>Keep this page open until your encrypted backup or upload finishes, or leave and risk losing the latest changes.</p></div><div className="modal-actions"><button className="button button-ghost" onClick={()=>blocker.reset()}>Stay here</button><button className="button button-danger" onClick={()=>blocker.proceed()}>Leave anyway</button></div></Modal>}
  {confirm&&<Modal title="Keep this moment forever?" subtitle="Please take a moment before you publish." onClose={()=>{if(!publishing)setConfirm(false);}}><div className="confirmation-copy"><p><strong>Published entries cannot be edited or deleted.</strong> Your words and attachments will be kept exactly as they are.</p>{view.snapshot.forVault&&<p>This entry is designated for the Feelings Vault. If both members approve, it will be revealed to the other person, who may copy or save it.</p>}<p>Your draft will remain available if publishing fails.</p></div><div className="modal-actions"><button className="button button-ghost" onClick={()=>setConfirm(false)} disabled={publishing}>Go back</button><button className="button button-primary" onClick={()=>void publish()} disabled={publishing}>{publishing?'Publishing…':'Publish permanently'}</button></div></Modal>}
 </div>;
}
function LockKeyholeMini(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>;}
