import { useState } from 'react';
import type { FormEvent } from 'react';
import { Heart, LockKeyhole, UserRound, UsersRound } from 'lucide-react';
import { Modal } from './Modal';
import { createDiaryKey } from '../crypto';
import { post } from '../api';
import { useToast } from './Toast';
import { useAuth } from '../AuthContext';
import type { Diary } from '../types';
export function CreateDiary({onClose,onCreated}:{onClose:()=>void;onCreated:(d:Diary)=>void}){
 const {preview}=useAuth();const {notify}=useToast();
 const [name,setName]=useState('');const [kind,setKind]=useState<'personal'|'connected'>('connected');const [relation,setRelation]=useState('Partner');const [other,setOther]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [mode,setMode]=useState<'none'|'date'|'duration'>('none');const [targetDate,setTargetDate]=useState('');const [days,setDays]=useState('100');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setError('');if(preview){setError('This is a sample preview. Configure Firebase and sign in to create a real diary.');return;}
  if(password.length<12){setError('Choose a diary password of at least 12 characters.');return;}if(password!==confirm){setError('The diary passwords do not match.');return;}
  setBusy(true);try{
   const id=crypto.randomUUID();const {envelope,escrowKey}=await createDiaryKey(id,password);
   const payload={id,title:name.trim(),kind,...(kind==='connected'?{relationshipLabel:relation.trim(),otherName:other.trim()}:{}),targetMode:mode,...(mode==='date'?{targetDate}:{}),...(mode==='duration'?{targetDuration:Number(days)}:{}),passwordEnvelope:envelope,escrowKey};
   const result=await post<{diary:Diary}>('/diaries',payload);setPassword('');setConfirm('');notify('Diary created.','success');onCreated(result.diary);
  }catch(err){setError(err instanceof Error?err.message:'Could not create the diary.');}finally{setBusy(false);}
 }
 return <Modal title="A new little space" subtitle="For the moments you’ll want to come back to." onClose={onClose} wide>
  <form className="form-grid" onSubmit={submit}>
   {preview&&<div className="form-notice"><Heart size={15}/> Sample preview only — no diary will be created.</div>}
   <label className="field full"><span>Diary name</span><input required maxLength={80} placeholder="e.g. Our little world" value={name} onChange={e=>setName(e.target.value)}/></label>
   <fieldset className="full fieldset"><legend>What kind of diary?</legend><div className="type-choice"><button type="button" className={kind==='connected'?'selected':''} onClick={()=>setKind('connected')}><UsersRound size={19}/><span><b>Connected</b><small>For you and one other</small></span></button><button type="button" className={kind==='personal'?'selected':''} onClick={()=>setKind('personal')}><UserRound size={19}/><span><b>Personal</b><small>Just for you</small></span></button></div></fieldset>
   {kind==='connected'&&<><label className="field"><span>Relationship label</span><input required maxLength={60} value={relation} onChange={e=>setRelation(e.target.value)} placeholder="e.g. Partner, best friend"/></label><label className="field"><span>Their display name</span><input required maxLength={80} value={other} onChange={e=>setOther(e.target.value)} placeholder="e.g. Jamie"/></label></>}
   <label className="field"><span>Diary password</span><input required type="password" minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters"/></label>
   <label className="field"><span>Confirm password</span><input required type="password" minLength={12} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Enter it again"/></label>
   <p className="field-help full"><LockKeyhole size={14}/> The password unlocks your diary on this device. Share it privately with your invited person; we never store it. Use a unique passphrase. The service holds an owner escrow key, so encryption does not protect against the operator.</p>
   <label className="field"><span>A gentle target <small>(optional)</small></span><select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="none">No target</option><option value="date">A particular date</option><option value="duration">A number of days</option></select></label>
   {mode==='date'&&<label className="field"><span>Target date</span><input required type="date" min={new Date().toISOString().slice(0,10)} value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label>}
   {mode==='duration'&&<label className="field"><span>Number of days</span><input required type="number" min="1" max="36500" value={days} onChange={e=>setDays(e.target.value)}/></label>}
   <p className="field-help full">A target is only a reminder, never a lock. {kind==='connected'&&mode==='duration'?'The countdown begins once both people join.':''} It won’t unlock the vault. Target dates use UTC.</p>
   {error&&<p className="form-error full" role="alert">{error}</p>}
   <div className="modal-actions full"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Creating securely…':'Create diary'} <span>→</span></button></div>
  </form>
 </Modal>;
}
