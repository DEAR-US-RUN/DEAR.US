import type { NextFunction,Request,Response } from 'express';
import { createHash } from 'node:crypto';
import { query } from './db';
import { AppError } from './errors';
export function originGuard(req:Request,_res:Response,next:NextFunction) {
  const origin=req.get('origin');
  if (!origin) return next();
  const allowed=(process.env.APP_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if (allowed.includes(origin) || (process.env.NODE_ENV !== 'production' && allowed.length===0)) return next();
  next(new AppError(403,'ORIGIN_DENIED','This request is not allowed.'));
}
export function rateLimit(scope:string, limit:number, seconds:number, useUser=false) {
  return async (req:Request,_res:Response,next:NextFunction) => {
    try {
      const principal=useUser ? req.identity?.uid || req.ip || 'unknown' : req.ip || 'unknown';
      const bucket=createHash('sha256').update(`${scope}:${principal}`).digest('hex');
      const windowStart=new Date(Math.floor(Date.now()/1000/seconds)*seconds*1000);
      const r=await query(`INSERT INTO rate_limits(bucket,window_start,count) VALUES($1,$2,1)
        ON CONFLICT(bucket,window_start) DO UPDATE SET count=rate_limits.count+1 RETURNING count`,[bucket,windowStart]);
      if (Number(r.rows[0].count)>limit) {
        if ((scope.startsWith('owner')||scope.startsWith('invitation')) && req.user) await query("INSERT INTO audit_logs(actor_id,action,outcome,detail) VALUES($1,$2,'failure','Rate limit exceeded')",[req.user.id,scope.startsWith('owner')?'owner.rate_limit':'invitation.rate_limit']);
        throw new AppError(429,'RATE_LIMITED','Too many attempts. Please wait and try again.');
      }
      next();
    } catch(e) { next(e); }
  };
}
