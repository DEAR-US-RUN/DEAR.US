import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, getMultiFactorResolver, TotpMultiFactorGenerator } from 'firebase/auth';
import type { MultiFactorResolver } from 'firebase/auth';
import { auth,firebaseConfigured,googleProvider } from './firebase';
import { api, post } from './api';
import type { User } from './types';
import { useToast } from './components/Toast';
interface AuthState {user:User|null;loading:boolean;preview:boolean;configured:boolean;error:string|null;signIn:()=>Promise<void>;completeMfa:(code:string)=>Promise<void>;mfaRequired:boolean;signOut:()=>Promise<void>;enterPreview:()=>void;leavePreview:()=>void}
const Context=createContext<AuthState>(null!);
export function AuthProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(!!auth);const [preview,setPreview]=useState(!firebaseConfigured);const [error,setError]=useState<string|null>(null);const [resolver,setResolver]=useState<MultiFactorResolver|null>(null);const signingIn=useRef(false);const {notify}=useToast();
 useEffect(()=>{
  if(!auth)return;
  return onAuthStateChanged(auth,async firebaseUser=>{
   if(!firebaseUser){setUser(null);setLoading(false);return;}
   setLoading(true);
   try {await post('/auth/sync',{});const me=await api<{user:User}>('/me');setUser(me.user);setError(null);setPreview(false);if(signingIn.current){notify('Signed in successfully.','success');signingIn.current=false;}}
   catch(e){setUser(null);setError(e instanceof Error?e.message:'Could not start your session.');}
   finally{setLoading(false);}
  });
 },[]);
 useEffect(()=>{
  const expire=()=>{setUser(null);setError('Your session expired. Sign in again.');if(auth)void firebaseSignOut(auth).catch(()=>{});};
  window.addEventListener('dear-us:session-expired',expire);return()=>window.removeEventListener('dear-us:session-expired',expire);
 },[]);
 async function signIn(){
  if(!auth){setError('Firebase is not configured yet. Follow the setup guide to enable Google sign-in.');return;}
  setError(null);signingIn.current=true;
  try {await signInWithPopup(auth,googleProvider);}
  catch(e:any){
   if(e.code==='auth/multi-factor-auth-required'){
    const r=getMultiFactorResolver(auth,e);if(!r.hints.some(h=>h.factorId==='totp')){setError('A TOTP authenticator is required for this sign-in.');return;}setResolver(r);
    }else {
    signingIn.current=false;
    const messages:Record<string,string>={
     'auth/unauthorized-domain':'This website is not authorized for Google sign-in. Add its hostname in Firebase Authentication settings.',
     'auth/operation-not-allowed':'Google sign-in is disabled in Firebase Authentication.',
     'auth/popup-blocked':'Your browser blocked the Google popup. Allow popups for this website and retry.',
     'auth/popup-closed-by-user':'The Google window was closed before sign-in finished. Please retry.',
     'auth/cancelled-popup-request':'Another sign-in window was opened. Finish that attempt or retry.',
     'auth/network-request-failed':'Google sign-in could not connect. Check your connection and the website Content Security Policy.',
     'auth/invalid-api-key':'The Firebase browser API key is invalid. The administrator must update it and rebuild.',
    };
    setError(messages[e.code]||'Google sign-in failed. Check Firebase configuration and try again.');
   }
  }
 }
 async function completeMfa(code:string){
  if(!resolver)return;
  const hint=resolver.hints.find(h=>h.factorId==='totp');if(!hint){setError('No supported authenticator was found.');return;}
  try{await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid,code));setResolver(null);}
  catch{setError('That authentication code was not accepted. Try again.');}
 }
 async function signOut(){if(auth)await firebaseSignOut(auth);setUser(null);setPreview(false);notify('Signed out.','info');}
 return <Context.Provider value={{user,loading,preview,configured:firebaseConfigured,error,signIn,completeMfa,mfaRequired:!!resolver,signOut,enterPreview:()=>setPreview(true),leavePreview:()=>setPreview(false)}}>{children}</Context.Provider>;
}
export const useAuth=()=>useContext(Context);
