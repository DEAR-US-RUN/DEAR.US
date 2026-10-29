import { useEffect,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart,UsersRound } from 'lucide-react';
import { post } from '../api';
import { useAuth } from '../AuthContext';
import { useToast } from '../components/Toast';
import type { Diary } from '../types';
export function Join(){
 const [token]=useState(()=>window.location.hash.slice(1));const [busy,setBusy]=useState(false);const [error,setError]=useState('');const {preview}=useAuth();const {notify}=useToast();const navigate=useNavigate();
 useEffect(()=>{if(window.location.hash)window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);},[]);
 async function accept(){if(preview){setError('Sign in with your own account to accept a real invitation.');return;}setBusy(true);try{const r=await post<{diary:Diary}>('/invitations/accept',{token});notify('Connection established.','success');navigate(`/diaries/${r.diary.id}`);}catch(e){setError(e instanceof Error?e.message:'This invitation is invalid or expired.');}finally{setBusy(false);}}
 return <div className="page simple-page"><div className="join-card"><span className="vault-icon"><UsersRound size={25}/></span><span className="eyebrow">A LITTLE SPACE FOR TWO</span><h1>You’ve been invited<span className="heading-period">.</span></h1><p>Someone has invited you to share a diary. Your own writing stays private unless you choose it for the Feelings Vault and both of you approve its reveal.</p><p>You’ll need the diary password from the person who invited you. Ask them to share it separately.</p>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy||!token} onClick={()=>void accept()}>{busy?'Joining…':'Accept invitation'} <Heart size={15}/></button>{!token&&<p className="field-help">This invitation link is missing its token. Ask for a new link.</p>}</div></div>;
}
