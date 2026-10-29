import { useState } from 'react';
import { Link,NavLink,Outlet,useLocation,useNavigate } from 'react-router-dom';
import { BookHeart, ChevronDown, Heart, LayoutGrid, LockKeyhole, LogOut, Menu, Settings2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { sampleUser } from '../sample';
import { Avatar } from './Avatar';
import { ThemePicker } from './ThemePicker';

function Brand(){return <Link to="/" className="brand" aria-label="dear, us. home"><span className="brand-mark"><Heart size={20} strokeWidth={1.35}/></span><span>dear, us<span className="brand-dot">.</span></span></Link>;}
export function Layout(){
 const {user,preview,leavePreview,signOut}=useAuth();const current=preview?sampleUser:user!;const [open,setOpen]=useState(false);const location=useLocation();const navigate=useNavigate();
 const nav=[{to:'/',label:'Overview',icon:LayoutGrid,end:true},{to:'/diaries',label:'My diaries',icon:BookHeart},{to:'/vault',label:'Feelings vault',icon:LockKeyhole},{to:'/settings',label:'Settings',icon:Settings2}];
 return <div className="app-shell">
  {open&&<button className="mobile-scrim" aria-label="Close menu" onClick={()=>setOpen(false)}/>}
  <aside className={`sidebar ${open?'sidebar-open':''}`}>
   <div className="sidebar-top"><Brand/><button className="mobile-close" aria-label="Close menu" onClick={()=>setOpen(false)}><X size={20}/></button></div>
   <div className="sidebar-label">YOUR LITTLE CORNER</div>
   <nav className="side-nav" aria-label="Main navigation">{nav.map(({to,label,icon:Icon,end})=><NavLink key={to} end={end} to={to} onClick={()=>setOpen(false)} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon size={18} strokeWidth={1.6}/><span>{label}</span>{to==='/vault'&&<span className="nav-sparkle">✦</span>}</NavLink>)}{current.isOwner&&!preview&&<NavLink to="/owner" className={({isActive})=>`nav-link ${isActive?'active':''}`}><ShieldCheck size={18}/><span>Owner panel</span></NavLink>}</nav>
   <div className="sidebar-note"><div className="note-icon"><Heart size={17} strokeWidth={1.4}/></div><p>A little space for<br/><em>the things that matter.</em></p><span>MADE WITH CARE, FOR YOU</span></div>
   <div className="sidebar-bottom"><Avatar name={current.name} avatar={current.avatar} tone="cream"/><div className="sidebar-user"><strong>{preview?'Sample account':current.name}</strong><span>{preview?'Just looking around':'Your private space'}</span></div><button aria-label={preview?'Sign in':'Sign out'} title={preview?'Sign in':'Sign out'} onClick={()=>{if(preview){leavePreview();navigate('/sign-in');}else void signOut();}}><LogOut size={17}/></button></div>
  </aside>
  <div className="main-shell">
   <header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setOpen(true)} aria-label="Open menu"><Menu size={22}/></button><div className="breadcrumb"><span>YOUR SPACE</span><span className="breadcrumb-slash">/</span><strong>{location.pathname==='/vault'?'FEELINGS VAULT':location.pathname==='/settings'?'SETTINGS':location.pathname.startsWith('/diaries/')?'DIARY':'OVERVIEW'}</strong></div><div className="top-actions"><ThemePicker/><div className="top-security"><ShieldCheck size={15}/> <span>{preview?'A thoughtful space':'Your private space'}</span></div><span className="top-divider"/><Link to="/settings" className="profile-link"><Avatar name={current.name} avatar={current.avatar} size="small" tone="rose"/><span>{preview?'Sample':current.name.split(' ')[0]}</span><ChevronDown size={14}/></Link></div></header>
   {preview&&<div className="preview-strip"><span className="preview-pill">SAMPLE PREVIEW</span><span>Explore example diaries. No diary data is saved or connected.</span><button onClick={()=>{leavePreview();navigate('/sign-in');}}>Set up & sign in <span>→</span></button></div>}
   <main id="main-content"><Outlet/></main>
  </div>
 </div>;
}
