import type { NextFunction, Request, Response } from 'express';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { AppError, forbidden } from './errors';
import { query } from './db';

export type Identity = { uid:string; email?:string; name?:string; picture?:string; auth_time:number; firebase?:{sign_in_provider?:string;sign_in_second_factor?:string} };
declare global { namespace Express { interface Request { identity: Identity; user: {id:string; firebase_uid:string; display_name:string; status:string}; } } }
export type TokenVerifier = (token:string) => Promise<Identity>;
function admin() {
  if (process.env.NODE_ENV==='production' && process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('FIREBASE_NOT_CONFIGURED');
  if (!getApps().length) {
    const {FIREBASE_PROJECT_ID:projectId,FIREBASE_CLIENT_EMAIL:clientEmail,FIREBASE_PRIVATE_KEY:privateKey}=process.env;
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      // Emulator tokens are unsigned; permit only an explicit local demo project outside production.
      if(!projectId?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw new Error('FIREBASE_NOT_CONFIGURED');
      initializeApp({projectId});
    } else {
      if (!projectId || !clientEmail || !privateKey) throw new Error('FIREBASE_NOT_CONFIGURED');
      initializeApp({credential:cert({projectId,clientEmail,privateKey:privateKey.replace(/\\n/g,'\n')})});
    }
  }
  return getAuth();
}
export const verifyFirebase: TokenVerifier = async token => await admin().verifyIdToken(token, true) as DecodedIdToken;
export function authenticate(verifier:TokenVerifier=verifyFirebase) {
  return async (req:Request,_res:Response,next:NextFunction) => {
    const header=req.headers.authorization || '';
    if (!header.startsWith('Bearer ') || header.length > 8192) return next(new AppError(401,'UNAUTHENTICATED','Your session expired. Sign in again.'));
    try {
      const identity=await verifier(header.slice(7));
      if (!identity.uid || identity.firebase?.sign_in_provider !== 'google.com') throw new Error('Invalid provider');
      req.identity=identity; next();
    } catch (error:any) {
      if (error?.message === 'FIREBASE_NOT_CONFIGURED') return next(error);
      next(new AppError(401,'UNAUTHENTICATED','Your session expired. Sign in again.'));
    }
  };
}
export async function loadUser(req:Request,_res:Response,next:NextFunction) {
  try {
    const result=await query('SELECT id,firebase_uid,display_name,status FROM users WHERE firebase_uid=$1',[req.identity.uid]);
    if (!result.rows[0] || result.rows[0].status!=='active') throw new AppError(403,'ACCOUNT_UNAVAILABLE','This account is unavailable. Contact support.');
    req.user=result.rows[0]; next();
  } catch(e) { next(e); }
}
export async function ownerOnly(req:Request,_res:Response,next:NextFunction) {
  const allow=(process.env.OWNER_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  // Firebase records MFA in the verified token; a fresh reauthentication is also required.
  const isOwner=allow.includes(req.identity.uid);
  const fresh=Number.isFinite(req.identity.auth_time) && Date.now()/1000-req.identity.auth_time<300 && req.identity.auth_time<=Date.now()/1000+30;
  const mfa=req.identity.firebase?.sign_in_second_factor==='totp';
  if (!isOwner || !fresh || !mfa) {
    if (req.user) await query("INSERT INTO audit_logs(actor_id,action,outcome,detail) VALUES($1,'owner.authentication','failure','Owner allowlist, fresh authentication, or TOTP MFA required')",[req.user.id]).catch(()=>{});
    return next(forbidden());
  }
  next();
}
export async function revokeFirebase(uid:string) { await admin().revokeRefreshTokens(uid); }
