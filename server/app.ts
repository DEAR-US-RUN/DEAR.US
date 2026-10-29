import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { authenticate, loadUser, type TokenVerifier } from './auth';
import { errorHandler, AppError } from './errors';
import { query, transaction } from './db';
import { originGuard,rateLimit } from './security';
import { routes } from './routes';
import { safeSecretEquals } from './crypto';
import { deleteObject } from './storage';
import { reportOperationalFailure } from './monitoring';

export function createApp(options:{verifyIdToken?:TokenVerifier}={}) {
  const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:{policy:'same-origin'}}));
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use(originGuard);app.use(express.json({limit:'400kb',strict:true}));
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  // Vercel Cron authenticates with CRON_SECRET; it never uses a user's session.
  app.get('/api/cron/cleanup',async(req,res)=>{
    if(!safeSecretEquals(req.get('authorization')||'',`Bearer ${process.env.CRON_SECRET||''}`) || !process.env.CRON_SECRET)throw new AppError(401,'UNAUTHENTICATED','Authentication required.');
    const candidates=await transaction(async db=>{
      const rows=await db.query(`SELECT mu.id,mu.object_key FROM media_uploads mu
        WHERE ((mu.state IN ('pending','ready') AND mu.created_at<now()-interval '24 hours') OR (mu.state='deleting' AND mu.updated_at<now()-interval '1 hour'))
          AND NOT EXISTS (SELECT 1 FROM drafts d WHERE mu.id=ANY(d.attachment_ids))
          AND NOT EXISTS (SELECT 1 FROM entry_attachments ea WHERE ea.upload_id=mu.id)
        ORDER BY mu.created_at FOR UPDATE SKIP LOCKED LIMIT 50`);
      const eligible=[];
      for(const row of rows.rows){
        // A draft may have committed after the SELECT snapshot but before we acquired the row lock.
        // Recheck in a new READ COMMITTED statement while holding that lock.
        const marked=await db.query(`UPDATE media_uploads mu SET state='deleting',updated_at=now() WHERE mu.id=$1
          AND NOT EXISTS (SELECT 1 FROM drafts d WHERE mu.id=ANY(d.attachment_ids))
          AND NOT EXISTS (SELECT 1 FROM entry_attachments ea WHERE ea.upload_id=mu.id) RETURNING id,object_key`,[row.id]);
        if(marked.rows[0])eligible.push(marked.rows[0]);
      }
      return eligible;
    });
    let removed=0,failed=0;
    for(const c of candidates){try{await deleteObject(c.object_key);await query("DELETE FROM media_uploads WHERE id=$1 AND state='deleting'",[c.id]);removed++;}catch{failed++;/* stale deleting rows retry after one hour */}}
    if(failed){console.warn(JSON.stringify({level:'warn',event:'cleanup_failed',count:failed}));await reportOperationalFailure('CleanupFailure');}
    await query("DELETE FROM rate_limits WHERE window_start<now()-interval '7 days'");
    await query("DELETE FROM draft_save_operations WHERE created_at<now()-interval '30 days'");
    res.json({ok:failed===0,processed:candidates.length,removed,failed});
  });
  app.use('/api',rateLimit('global-ip',400,60),authenticate(options.verifyIdToken));
  app.post('/api/auth/sync',rateLimit('auth-sync',30,300,true),async(req,res)=>{
    z.object({}).strict().parse(req.body);
    const uid=req.identity.uid;
    const name=(req.identity.name||req.identity.email?.split('@')[0]||'Friend').slice(0,80);
    const email=req.identity.email?.slice(0,254)||null;
    // Only Firebase-signed identity claims are used; the request cannot select a UID.
    const r=await query(`INSERT INTO users(firebase_uid,email,display_name,avatar_url) VALUES($1,$2,$3,$4)
      ON CONFLICT(firebase_uid) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url,updated_at=now()
      RETURNING id,firebase_uid,display_name,status`,[uid,email,name,req.identity.picture?.slice(0,1024)||null]);
    if(r.rows[0].status!=='active')throw new AppError(403,'ACCOUNT_UNAVAILABLE','This account is unavailable. Contact support.');
    res.json({user:r.rows[0]});
  });
  app.use('/api',loadUser,routes);
  app.use('/api',(_req,_res,next)=>next(new AppError(404,'NOT_FOUND','This resource is unavailable.')));
  app.use(errorHandler);return app;
}
export default createApp();
