import { ArrowUpRight, BookOpen, Clock3, Heart, LockKeyhole, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Diary } from '../types';
import { bytes,relative } from '../format';
import { Avatar } from './Avatar';
export function DiaryCard({diary,index=0}:{diary:Diary;index?:number}){
 const connected=diary.kind==='connected';
 return <Link className="diary-card" to={`/diaries/${diary.id}`}>
  <div className="diary-cover"><img src={connected?'/images/coast.jpg':'/images/morning.jpg'} alt="" loading={index?'lazy':'eager'}/><span className={`cover-badge ${connected?'':'cover-badge-personal'}`}>{connected?<UsersRound size={12}/>:<LockKeyhole size={12}/>} {connected?'CONNECTED DIARY':'PERSONAL DIARY'}</span><span className="cover-arrow"><ArrowUpRight size={17}/></span></div>
  <div className="diary-card-body"><div className="diary-card-title"><div><h3>{diary.title}</h3><p>{connected?diary.members.length===2?`A space for ${diary.members.map(m=>m.name.split(' ')[0]).join(' & ')}`:`Waiting for ${diary.otherName}`:'A space just for you'}</p></div><span className="card-heart"><Heart size={17} strokeWidth={1.4}/></span></div>
   <div className="card-meta"><span><BookOpen size={14}/> {diary.myEntryCount} {diary.myEntryCount===1?'entry':'entries'}</span><span><Clock3 size={14}/> {relative(diary.lastActivityAt)}</span><span>{bytes(diary.myStorageBytes)} media</span></div>
   <div className="card-bottom"><div className="mini-avatars">{diary.members.map((m,i)=><Avatar key={m.id} name={m.name} avatar={m.avatar} size="small" tone={i?'rose':'sage'}/>)}</div><span>{connected?diary.members.length===2?'A shared space':'Invitation pending':'Your own little corner'}</span><span className="card-open">Open diary <ArrowUpRight size={13}/></span></div>
  </div>
 </Link>;
}
