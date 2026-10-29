import { useState } from 'react';
import type { FormEvent } from 'react';
import { multiFactor,reauthenticateWithPopup,TotpMultiFactorGenerator } from 'firebase/auth';
import type { TotpSecret } from 'firebase/auth';
import { auth,googleProvider } from '../firebase';
import { useAuth } from '../AuthContext';
import { useToast } from './Toast';

/** A one-time, local-only owner enrollment flow; the TOTP secret is never sent to our API. */
export function OwnerMfaSetup(){
 const {signOut}=useAuth();const {notify}=useToast();
 const [secret,setSecret]=useState<TotpSecret|null>(null);const [code,setCode]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function begin(){
  setError('');setBusy(true);
  try{
   const user=auth?.currentUser;if(!user)throw new Error('Sign in before enrolling an authenticator.');
   if(multiFactor(user).enrolledFactors.some(f=>f.factorId==='totp'))throw new Error('An authenticator is already enrolled. Sign out and sign in with its code to open the owner panel.');
   await reauthenticateWithPopup(user,googleProvider);
   const session=await multiFactor(user).getSession();
   setSecret(await TotpMultiFactorGenerator.generateSecret(session));
  }catch(e){setError(e instanceof Error&&e.message.startsWith('An authenticator')?e.message:'Could not start enrollment. Check that TOTP MFA is enabled in Firebase, your email is verified, and popups are allowed.');}
  finally{setBusy(false);}
 }
 async function finish(e:FormEvent){
  e.preventDefault();if(!secret||!auth?.currentUser)return;setError('');setBusy(true);
  try{
   const assertion=TotpMultiFactorGenerator.assertionForEnrollment(secret,code.trim());
   await multiFactor(auth.currentUser).enroll(assertion,'Owner authenticator');
   setSecret(null);setCode('');await signOut();notify('Authenticator enrolled. Sign in again with Google and your authenticator code.','success');
  }catch{setError('The code was not accepted, or enrollment expired. Check your authenticator and try again.');}
  finally{setBusy(false);}
 }
 return <div className="settings-section"><h2>Owner authenticator</h2><p>Owner access requires a recently verified Google sign-in and a TOTP authenticator. Enrollment requires Firebase Identity Platform with TOTP enabled.</p>
  {!secret?<button className="button button-outline" type="button" disabled={busy} onClick={()=>void begin()}>{busy?'Starting…':'Set up authenticator'}</button>:
   <form className="single-form" onSubmit={finish}><p className="field-help">Add a new account manually in your authenticator app using the one-time setup key below. Do not share it or save it in a diary.</p>
    <label className="field"><span>One-time setup key</span><input readOnly value={secret.secretKey} autoComplete="off" spellCheck={false}/></label>
    <label className="field"><span>Authenticator code</span><input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" minLength={6} maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
    <div className="modal-actions"><button type="button" className="button button-ghost" onClick={()=>{setSecret(null);setCode('');setError('');}}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Enrolling…':'Finish setup'}</button></div>
   </form>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </div>;
}
