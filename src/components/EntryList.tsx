import { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, Heart, LockKeyhole, Paperclip, Play } from 'lucide-react';
import { api } from '../api';
import { decryptContent,decryptMedia } from '../crypto';
import type { Attachment,Diary,Entry,EntryContent } from '../types';
import { dateLabel } from '../format';
import { Avatar } from './Avatar';
import { useToast } from './Toast';

type OpenEntry=Entry&{content?:EntryContent;error?:boolean};
export function EntryList({diary,diaryKey,view}:{diary:Diary;diaryKey:CryptoKey;view:'mine'|'vault'}){
 const [entries,setEntries]=useState<OpenEntry[]>([]);const [cursor,setCursor]=useState<string|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 async function load(next?:string){setLoading(true);try{const r=await api<{entries:Entry[];nextCursor:string|null}>(`/diaries/${diary.id}/entries?view=${view}${next?`&cursor=${encodeURIComponent(next)}`:''}`);const opened=await Promise.all(r.entries.map(async e=>{try{return {...e,content:await decryptContent<EntryContent>(diaryKey,diary.id,e.authorUid,e.ciphertext)};}catch{return {...e,error:true};}}));setEntries(old=>next?[...old,...opened]:opened);setCursor(r.nextCursor);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load entries.');}finally{setLoading(false);}}
 useEffect(()=>{setEntries([]);setCursor(null);void load();},[diary.id,view,diaryKey]);
 if(loading&&!entries.length)return <div className="loading-block">Opening your pages…</div>;
 if(error&&!entries.length)return <div className="empty-card"><p>{error}</p><button className="button button-outline" onClick={()=>void load()}>Try again</button></div>;
 if(!entries.length)return <div className="entries-empty"><div className="empty-icon"><BookOpen size={22}/></div><h3>{view==='vault'?'Nothing was placed in the vault.':'A blank page, just for you.'}</h3><p>{view==='vault'?'Only entries deliberately designated for the vault appear here.':'When you’re ready, start with whatever is on your mind.'}</p></div>;
 return <div className="entry-list">{entries.map(e=><article className="entry-card" key={e.id}><div className="entry-heading"><div className="entry-author"><Avatar name={e.authorName} size="small" tone={e.authorId===diary.myId?'sage':'rose'}/><div><strong>{e.authorId===diary.myId?'You':e.authorName}</strong><span>{dateLabel(e.createdAt,{month:'long',day:'numeric',year:'numeric'})}</span></div></div><span className={`entry-badge ${e.forVault?'entry-badge-rose':''}`}>{e.forVault?<Heart size={12}/>:<LockKeyhole size={12}/>} {e.forVault?(view==='vault'?'REVEALED':'FOR THE VAULT'):'PRIVATE'}</span></div>{e.error?<p className="form-error">This entry could not be decrypted with this diary key.</p>:<><h3>{e.content?.title||'An untitled moment'}</h3><p className="entry-text">{e.content?.body}</p>{e.content?.attachments?.length?<div className="entry-media">{e.content.attachments.map(a=><SecureAttachment key={a.id} diaryId={diary.id} diaryKey={diaryKey} attachment={a}/>)}</div>:null}</>}</article>)}{cursor&&<button className="button button-outline load-more" disabled={loading} onClick={()=>void load(cursor)}>{loading?'Loading…':'Load more entries'} <ChevronDown size={15}/></button>}</div>;
}
function SecureAttachment({diaryId,diaryKey,attachment}:{diaryId:string;diaryKey:CryptoKey;attachment:Attachment}){
 const [url,setUrl]=useState('');const [loading,setLoading]=useState(false);const {notify}=useToast();
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 async function open(){setLoading(true);try{const r=await api<{url:string;iv:string;mime:string}>(`/uploads/${attachment.id}/download`);const response=await fetch(r.url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('Attachment could not be downloaded.');const encrypted=await response.arrayBuffer();const data=await decryptMedia(diaryKey,diaryId,attachment.id,r.iv,encrypted);setUrl(URL.createObjectURL(new Blob([data],{type:attachment.mime})));}catch(e){notify(e instanceof Error?e.message:'Could not open attachment.','error');}finally{setLoading(false);}}
 if(!url)return <button className="media-open" onClick={()=>void open()} disabled={loading}><Paperclip size={14}/>{loading?'Opening…':attachment.name}<Play size={12}/></button>;
 if(attachment.mime.startsWith('image/'))return <img className="entry-image" src={url} alt={attachment.name} loading="lazy"/>;
 if(attachment.mime.startsWith('video/'))return <video className="entry-video" controls preload="none" src={url}/>;
 if(attachment.mime.startsWith('audio/'))return <audio controls preload="none" src={url}/>;
 return <a className="media-open" href={url} download={attachment.name}>Download {attachment.name}</a>;
}
