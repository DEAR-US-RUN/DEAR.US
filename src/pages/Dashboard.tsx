import { useState } from 'react';
import { ArrowRight, BookHeart, CalendarHeart, ChevronRight, Heart, LockKeyhole, Plus, RotateCw, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { Link,useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { sampleUser } from '../sample';
import { useDiaries } from '../hooks';
import { DiaryCard } from '../components/DiaryCard';
import { CreateDiary } from '../components/CreateDiary';
import { Avatar } from '../components/Avatar';
import { dateLabel,reminder } from '../format';

export function Dashboard(){
 const {preview,user}=useAuth();const person=preview?sampleUser:user!;const {diaries,loading,error,reload}=useDiaries();const [creating,setCreating]=useState(false);const [connectionInfo,setConnectionInfo]=useState(false);const navigate=useNavigate();
 const connected=diaries.find(d=>d.kind==='connected');const full=!preview&&diaries.length>=2;
 const greeting=(()=>{const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';})();
 return <div className="page dashboard-page">
  <div className="greeting-row"><div><p className="eyebrow greeting-date">{dateLabel(new Date(),{weekday:'long',month:'long',day:'numeric'}).toUpperCase()}</p><h1>{greeting}, {person.name.split(' ')[0]}<span className="heading-period">.</span> <span className="hello-sparkle">✳</span></h1><p className="page-subtitle">Here’s to the moments worth holding on to.</p></div><button className="button button-primary top-add" onClick={()=>setCreating(true)} disabled={full}><Plus size={16}/> Add diary</button></div>
  <section className="welcome-banner" aria-label="Welcome">
   <div className="banner-copy"><div className="banner-kicker"><span className="banner-kicker-line"/> A LITTLE SPACE FOR YOU</div><h2>Every story deserves<br/><em>a place to stay.</em></h2><p>For the big days, the little things, and all the<br className="desktop-break"/> feelings in between.</p><a href="#diaries" className="banner-link">Find your space <ArrowRight size={15}/></a></div>
   <div className="banner-photo"><img src="/images/flowers.jpg" alt="A small bouquet of wildflowers resting on linen"/></div>
   <div className="banner-stamp"><Heart size={16} strokeWidth={1.4}/><span>kept close<br/>to the heart</span></div><div className="banner-star star-one">✳</div><div className="banner-star star-two">✦</div>
  </section>
  <div className="dashboard-grid"><section id="diaries" className="diaries-section"><div className="section-heading"><div><span className="eyebrow">YOUR STORIES, YOUR WAY</span><h2>Your diaries <span className="section-count">{diaries.length}/2</span></h2><p>A little home for everything you want to remember.</p></div><button className="text-action" onClick={()=>setCreating(true)} disabled={full}><Plus size={15}/> Add diary</button></div>
   {full&&<p className="limit-note">You have reached the two-diary limit for this version.</p>}
   {loading?<div className="cards-grid"><div className="skeleton-card"/><div className="skeleton-card"/></div>:error?<div className="empty-card"><p>{error}</p><button className="button button-outline" onClick={()=>void reload()}>Try again</button></div>:diaries.length?<div className="cards-grid">{diaries.map((d,i)=><DiaryCard key={d.id} diary={d} index={i}/>)}</div>:<div className="empty-card"><div className="empty-icon"><BookHeart/></div><h3>Your story starts here.</h3><p>Make a little space for your thoughts, memories, and everything in between.</p><button className="button button-primary" onClick={()=>setCreating(true)}><Plus size={16}/> Create your first diary</button></div>}
   <div className="below-cards"><div className="below-icon"><Sparkles size={18}/></div><div><strong>Every page is yours.</strong><span>Write freely, at your own pace. There’s no right way to begin.</span></div><Heart className="below-heart" size={21} strokeWidth={1.2}/></div>
  </section>
  <aside className="dashboard-aside"><div className="aside-heading"><span className="eyebrow">A LITTLE CLOSER</span><h2>Your connection</h2><p>The meaningful things, at a glance.</p></div>
   {connected?<div className="connection-card"><div className="connection-top"><span className="connection-icon"><Heart size={17}/></span><span className="connection-status">{connected.members.length===2?'CONNECTED':'WAITING TO CONNECT'}</span><button type="button" className="connection-dots" aria-label="About this connection" aria-expanded={connectionInfo} aria-controls="connection-privacy-note" title="About this connection" onClick={()=>setConnectionInfo(open=>!open)}>···</button></div><div className="connection-insight" id="connection-privacy-note" hidden={!connectionInfo}><ShieldCheck size={16}/><p>Activity counts are shared. Your entries stay private unless you designate them for the vault and you both approve.</p></div><div className="connection-people"><div className="connection-avatars">{connected.members.map((m,i)=><Avatar key={m.id} name={m.name} avatar={m.avatar} size="large" tone={i?'rose':'sage'}/>)}{connected.members.length===1&&<span className="avatar avatar-large avatar-outline">?</span>}<span className="heart-bridge"><Heart size={12} fill="currentColor"/></span></div><h3>{connected.members.length===2?connected.members.map(m=>m.name.split(' ')[0]).join(' & '):`${connected.members[0].name.split(' ')[0]} & ${connected.otherName}`}</h3><p>{connected.relationshipLabel} <span>·</span> {connected.connectedAt?`since ${dateLabel(connected.connectedAt,{month:'short',day:'numeric',year:'numeric'})}`:'invitation pending'}</p></div>
    <div className="connection-stats"><div><strong>{connected.daysConnected??'—'}</strong><span>DAYS TOGETHER</span></div><div><strong>{connected.streak}</strong><span>WRITING-DAY STREAK</span></div></div>
    <div className="connection-divider"/><div className="connection-row"><span className="small-icon rose-icon"><LockKeyhole size={15}/></span><div><strong>Feelings vault</strong><small>{connected.unlockedAt?'Revealed together':'Waiting for both of you'}</small></div><Link aria-label="View feelings vault" to={`/diaries/${connected.id}?tab=vault`}><ChevronRight size={17}/></Link></div><div className="connection-row"><span className="small-icon gold-icon"><CalendarHeart size={15}/></span><div><strong>Target day</strong><small>{reminder(connected)}</small></div><Link aria-label="View diary target" to={`/diaries/${connected.id}`}><ChevronRight size={17}/></Link></div>
    <Link className="connection-footer" to={`/diaries/${connected.id}`}>Visit your shared space <ArrowRight size={15}/></Link>
   </div>:<div className="connection-card no-connection"><span className="connection-icon"><UsersRound size={20}/></span><h3>A little closer, together.</h3><p>Create a connected diary and invite one person to join your space.</p><button className="button button-outline" onClick={()=>setCreating(true)} disabled={full}>Create a connected diary</button></div>}
   <GentleReminder/>
  </aside></div>
  <div className="page-end"><span>Made for the moments that matter.</span><span>WITH LOVE, DEAR, US. ♡</span></div>
  {creating&&<CreateDiary onClose={()=>setCreating(false)} onCreated={d=>{setCreating(false);void reload();navigate(`/diaries/${d.id}`);}}/>}
 </div>;
}

const gentleThoughts=[
 {line:'There’s beauty in the',highlight:'ordinary moments, too.'},
 {line:'You don’t need the',highlight:'perfect words to begin.'},
 {line:'Take it one page,',highlight:'one day at a time.'},
 {line:'Your story is allowed',highlight:'to unfold slowly.'},
];
function GentleReminder(){
 const [index,setIndex]=useState(0);const thought=gentleThoughts[index];
 return <div className="reminder-card"><span className="reminder-icon" aria-hidden="true">✳</span><div><span className="eyebrow">A GENTLE REMINDER</span><p aria-live="polite"><span className="reminder-thought" key={index}>{thought.line}<br/><em>{thought.highlight}</em></span></p></div><button type="button" className="reminder-next" aria-label="Show another gentle reminder" title="Show another gentle reminder" onClick={()=>setIndex(i=>(i+1)%gentleThoughts.length)}><RotateCw size={16}/></button></div>;
}
