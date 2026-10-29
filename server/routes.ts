import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, transaction } from './db';
import { AppError, conflict, forbidden, missing } from './errors';
import { diarySchema, draftSchema, uploadSchema, uuid } from './validation';
import { hashToken, sealOwnerKey, openOwnerKey, decryptEntry, verifyOwnerCredential } from './crypto';
import { audit, diarySummary, member } from './helpers';
import { rateLimit } from './security';
import { ownerOnly, revokeFirebase } from './auth';
import { presignUpload, checkUploaded, presignDownload } from './storage';

export const routes=Router();

routes.get('/me', async (req,res)=>{
  res.json({user:{id:req.user.id,uid:req.identity.uid,name:req.user.display_name,email:req.identity.email || null,avatar:req.identity.picture || null,isOwner:(process.env.OWNER_UIDS||'').split(',').map(x=>x.trim()).includes(req.identity.uid)}});
});
routes.get('/diaries', async (req,res)=>{
  const list=await query('SELECT diary_id FROM diary_members WHERE user_id=$1 ORDER BY joined_at',[req.user.id]);
  const diaries=await Promise.all(list.rows.map(r=>diarySummary(r.diary_id,req.user.id)));
  res.json({diaries});
});
routes.post('/diaries', rateLimit('diary-create',10,3600,true), async(req,res)=>{
  const input=diarySchema.parse(req.body);
  const ownerEnvelope=sealOwnerKey(input.escrowKey,input.id); // The raw key is wrapped immediately, never stored or logged.
  await transaction(async db=>{
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    const count=await db.query('SELECT count(*)::int AS n FROM diary_members WHERE user_id=$1',[req.user.id]);
    if(count.rows[0].n>=2)throw conflict('You can have up to two diary spaces.','DIARY_LIMIT');
    const targetDate=input.targetMode==='date' ? input.targetDate : null;
    await db.query(`INSERT INTO diaries(id,owner_id,title,kind,relationship_label,other_name,target_mode,target_duration,target_date)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7='duration' AND $4='personal' THEN (now() AT TIME ZONE 'UTC')::date + $8::int ELSE $9::date END)`,
      [input.id,req.user.id,input.title,input.kind,input.kind==='connected'?input.relationshipLabel:null,input.kind==='connected'?input.otherName:null,input.targetMode,input.targetMode==='duration'?input.targetDuration:null,targetDate]);
    await db.query("INSERT INTO diary_members(diary_id,user_id,role) VALUES($1,$2,'owner')",[input.id,req.user.id]);
    await db.query("INSERT INTO diary_key_envelopes(diary_id,purpose,envelope) VALUES($1,'password',$2),($1,'owner_escrow',$3)",[input.id,JSON.stringify(input.passwordEnvelope),JSON.stringify(ownerEnvelope)]);
    await db.query('INSERT INTO feelings_vault(diary_id) VALUES($1)',[input.id]);
    await db.query('INSERT INTO connection_state(diary_id) VALUES($1)',[input.id]);
    await db.query("INSERT INTO audit_logs(actor_id,diary_id,action,outcome) VALUES($1,$2,'diary.create','success')",[req.user.id,input.id]);
  });
  res.status(201).json({diary:await diarySummary(input.id,req.user.id)});
});
routes.get('/diaries/:id', async(req,res)=>{
  const id=String(req.params.id); const diary=await diarySummary(id,req.user.id);
  const key=await query("SELECT envelope FROM diary_key_envelopes WHERE diary_id=$1 AND purpose='password'",[id]);
  res.json({diary,passwordEnvelope:key.rows[0].envelope});
});

routes.post('/diaries/:id/invitations',rateLimit('invitation-create',10,3600,true),async(req,res)=>{
  const id=String(req.params.id); const token=randomBytes(32).toString('base64url');
  await transaction(async db=>{
    const d=await member(id,req.user.id,db); if(d.role!=='owner'||d.kind!=='connected')throw forbidden();
    await db.query('SELECT id FROM diaries WHERE id=$1 FOR UPDATE',[id]);
    const c=await db.query('SELECT count(*)::int AS n FROM diary_members WHERE diary_id=$1',[id]);
    if(c.rows[0].n>=2)throw conflict('This diary already has two members.','DIARY_FULL');
    await db.query('UPDATE diary_invitations SET revoked_at=now() WHERE diary_id=$1 AND used_at IS NULL AND revoked_at IS NULL',[id]);
    await db.query("INSERT INTO diary_invitations(diary_id,created_by,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '72 hours')",[id,req.user.id,hashToken(token)]);
    await db.query("INSERT INTO audit_logs(actor_id,diary_id,action,outcome) VALUES($1,$2,'invitation.create','success')",[req.user.id,id]);
  });
  // Return the secret only once. The browser places it in a URL fragment, not a server log.
  res.status(201).json({token,expiresInHours:72});
});
routes.post('/invitations/accept',rateLimit('invitation-accept-ip',15,600),rateLimit('invitation-accept-user',10,600,true),async(req,res)=>{
  const parsed=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().safeParse(req.body);
  if(!parsed.success){await audit(req.user.id,'invitation.accept','failure',null,'Malformed invitation attempt').catch(()=>{});throw new AppError(400,'INVALID_INPUT','Please check your input and try again.');}
  const tokenHash=hashToken(parsed.data.token);
  let diaryId:string;
  try {diaryId=await transaction(async db=>{
    const invite=await db.query(`SELECT * FROM diary_invitations WHERE token_hash=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,[tokenHash]);
    if(!invite.rows[0])throw new AppError(404,'INVITATION_INVALID','This invitation is invalid or expired.');
    const row=invite.rows[0];
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    const d=await db.query('SELECT * FROM diaries WHERE id=$1 FOR UPDATE',[row.diary_id]);
    const spaces=await db.query('SELECT count(*)::int AS n FROM diary_members WHERE user_id=$1',[req.user.id]);
    const members=await db.query('SELECT user_id FROM diary_members WHERE diary_id=$1',[row.diary_id]);
    if(spaces.rows[0].n>=2)throw conflict('You can have up to two diary spaces.','DIARY_LIMIT');
    if(d.rows[0]?.kind!=='connected'||members.rows.length!==1||members.rows.some(m=>m.user_id===req.user.id))throw new AppError(404,'INVITATION_INVALID','This invitation is invalid or expired.');
    await db.query("INSERT INTO diary_members(diary_id,user_id,role) VALUES($1,$2,'member')",[row.diary_id,req.user.id]);
    await db.query('UPDATE diary_invitations SET used_at=now(),used_by=$2 WHERE id=$1',[row.id,req.user.id]);
    await db.query('UPDATE connection_state SET connected_at=now() WHERE diary_id=$1',[row.diary_id]);
    await db.query("UPDATE diaries SET target_date=(now() AT TIME ZONE 'UTC')::date + target_duration WHERE id=$1 AND target_mode='duration'",[row.diary_id]);
    await db.query("INSERT INTO audit_logs(actor_id,diary_id,action,outcome) VALUES($1,$2,'invitation.accept','success')",[req.user.id,row.diary_id]);
    return row.diary_id as string;
  });} catch(e){await audit(req.user.id,'invitation.accept','failure',null,'Invitation rejected').catch(()=>{});throw e;}
  res.json({diary:await diarySummary(diaryId,req.user.id)});
});

routes.get('/diaries/:id/draft',async(req,res)=>{
  await member(req.params.id,req.user.id);
  const r=await query(`SELECT id,version,ciphertext,entry_type AS "entryType",for_vault AS "forVault",attachment_ids AS "attachmentIds",updated_at AS "updatedAt"
    FROM drafts WHERE diary_id=$1 AND author_id=$2`,[req.params.id,req.user.id]);
  res.json({draft:r.rows[0]||null});
});
routes.put('/diaries/:id/draft',async(req,res)=>{
  const id=req.params.id, input=draftSchema.parse(req.body);
  const payloadHash=hashToken(JSON.stringify(input));
  const result=await transaction(async db=>{
    const d=await member(id,req.user.id,db);
    await db.query('SELECT id FROM diaries WHERE id=$1 FOR UPDATE',[id]);
    const current=await db.query('SELECT * FROM drafts WHERE diary_id=$1 AND author_id=$2 FOR UPDATE',[id,req.user.id]);
    const existing=await db.query('SELECT * FROM draft_save_operations WHERE diary_id=$1 AND author_id=$2 AND operation_id=$3',[id,req.user.id,input.operationId]);
    if(existing.rows[0]) {
      if(existing.rows[0].payload_hash!==payloadHash)throw conflict('This save identifier was already used for different content.','DRAFT_OPERATION_CONFLICT');
      if(!current.rows[0] || current.rows[0].id!==existing.rows[0].draft_id) throw conflict('This draft was published or replaced.','DRAFT_REPLACED');
      return {draftId:existing.rows[0].draft_id,version:existing.rows[0].result_version,currentVersion:current.rows[0].version,repeated:true};
    }
    if((current.rows[0]?.version||0)!==input.expectedVersion)throw conflict('This draft changed in another tab. Your local copy is still available.','DRAFT_CONFLICT');
    const vault=await db.query('SELECT unlocked_at FROM feelings_vault WHERE diary_id=$1',[id]);
    if(input.forVault && (d.kind!=='connected'||vault.rows[0].unlocked_at))throw conflict('The vault is unavailable for new entries.','VAULT_UNAVAILABLE');
    if(input.attachmentIds.length){
      const files=await db.query("SELECT id FROM media_uploads WHERE id=ANY($1::uuid[]) AND diary_id=$2 AND author_id=$3 AND state='ready' FOR UPDATE",[input.attachmentIds,id,req.user.id]);
      if(files.rowCount!==input.attachmentIds.length)throw conflict('An attachment is unavailable. Please upload it again.','ATTACHMENT_UNAVAILABLE');
    }
    let saved;
    if(current.rows[0]) saved=await db.query(`UPDATE drafts SET version=version+1,ciphertext=$3,entry_type=$4,for_vault=$5,attachment_ids=$6,updated_at=now()
      WHERE diary_id=$1 AND author_id=$2 RETURNING id,version`,[id,req.user.id,JSON.stringify(input.ciphertext),input.entryType,input.forVault,input.attachmentIds]);
    else saved=await db.query(`INSERT INTO drafts(diary_id,author_id,ciphertext,entry_type,for_vault,attachment_ids)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version`,[id,req.user.id,JSON.stringify(input.ciphertext),input.entryType,input.forVault,input.attachmentIds]);
    await db.query('INSERT INTO draft_save_operations(diary_id,author_id,operation_id,draft_id,payload_hash,result_version) VALUES($1,$2,$3,$4,$5,$6)',[id,req.user.id,input.operationId,saved.rows[0].id,payloadHash,saved.rows[0].version]);
    return {draftId:saved.rows[0].id,version:saved.rows[0].version,currentVersion:saved.rows[0].version,repeated:false};
  });
  res.json(result);
});
routes.post('/diaries/:id/entries',async(req,res)=>{
  const id=String(req.params.id); const input=z.object({requestId:uuid,draftId:uuid,expectedVersion:z.number().int().positive(),confirm:z.literal(true)}).strict().parse(req.body);
  const result=await transaction(async db=>{
    await member(id,req.user.id,db);
    await db.query('SELECT id FROM diaries WHERE id=$1 FOR UPDATE',[id]);
    const prior=await db.query('SELECT id,diary_id,created_at,source_draft_id,source_draft_version FROM published_entries WHERE author_id=$1 AND request_id=$2',[req.user.id,input.requestId]);
    if(prior.rows[0]) {if(prior.rows[0].diary_id!==id||prior.rows[0].source_draft_id!==input.draftId||prior.rows[0].source_draft_version!==input.expectedVersion)throw conflict('This publication request has already been used for a different draft.');return {id:prior.rows[0].id,createdAt:prior.rows[0].created_at,repeated:true};}
    const draft=await db.query('SELECT * FROM drafts WHERE diary_id=$1 AND author_id=$2 FOR UPDATE',[id,req.user.id]);
    if(!draft.rows[0])throw conflict('There is no saved draft to publish.','DRAFT_MISSING');
    const dr=draft.rows[0]; if(dr.id!==input.draftId||dr.version!==input.expectedVersion)throw conflict('This draft changed in another tab.','DRAFT_CONFLICT');
    const vault=await db.query('SELECT unlocked_at FROM feelings_vault WHERE diary_id=$1',[id]);
    if(dr.for_vault && vault.rows[0].unlocked_at)throw conflict('The vault has already been revealed. Save this as a private entry instead.','VAULT_UNAVAILABLE');
    if(dr.attachment_ids.length){
      const files=await db.query("SELECT id FROM media_uploads WHERE id=ANY($1::uuid[]) AND diary_id=$2 AND author_id=$3 AND state='ready' FOR UPDATE",[dr.attachment_ids,id,req.user.id]);
      if(files.rowCount!==dr.attachment_ids.length)throw conflict('An attachment is unavailable. Your draft is safe.','ATTACHMENT_UNAVAILABLE');
    }
    const entry=await db.query(`INSERT INTO published_entries(diary_id,author_id,request_id,source_draft_id,source_draft_version,entry_type,ciphertext,for_vault)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at`,[id,req.user.id,input.requestId,dr.id,dr.version,dr.entry_type,dr.ciphertext,dr.for_vault]);
    for(const attachmentId of dr.attachment_ids){
      await db.query('INSERT INTO entry_attachments(entry_id,upload_id) VALUES($1,$2)',[entry.rows[0].id,attachmentId]);
      await db.query("UPDATE media_uploads SET state='published',updated_at=now() WHERE id=$1",[attachmentId]);
    }
    await db.query('DELETE FROM drafts WHERE id=$1',[dr.id]);
    await db.query('UPDATE diaries SET last_activity_at=now() WHERE id=$1',[id]);
    await db.query("INSERT INTO streak_events(diary_id,actor_id,event_type,entry_id) VALUES($1,$2,'publication',$3)",[id,req.user.id,entry.rows[0].id]);
    return {id:entry.rows[0].id,createdAt:entry.rows[0].created_at,repeated:false};
  });
  res.status(result.repeated?200:201).json({entry:result});
});
routes.get('/diaries/:id/entries',async(req,res)=>{
  const id=String(req.params.id); await member(id,req.user.id);
  const view=z.enum(['mine','vault']).default('mine').parse(req.query.view);
  const cursorSchema=z.object({createdAt:z.string().datetime({offset:true}),id:uuid});
  let cursor:{createdAt:string;id:string}|null=null;
  if(req.query.cursor){try {cursor=cursorSchema.parse(JSON.parse(Buffer.from(String(req.query.cursor),'base64url').toString('utf8')));}catch{throw new AppError(400,'INVALID_INPUT','Invalid page cursor.');}}
  if(view==='vault'){
    const v=await query('SELECT unlocked_at FROM feelings_vault WHERE diary_id=$1',[id]);
    if(!v.rows[0]?.unlocked_at)throw new AppError(403,'VAULT_LOCKED','The vault is waiting for both approvals.');
  }
  const entries=await query(`SELECT e.id,e.entry_type AS "entryType",e.ciphertext,e.for_vault AS "forVault",e.created_at AS "createdAt",
    u.id AS "authorId",u.firebase_uid AS "authorUid",u.display_name AS "authorName",
    coalesce((SELECT json_agg(json_build_object('id',mu.id,'iv',mu.iv,'mime',mu.declared_mime,'size',mu.plaintext_size) ORDER BY mu.created_at)
      FROM entry_attachments ea JOIN media_uploads mu ON mu.id=ea.upload_id WHERE ea.entry_id=e.id),'[]'::json) AS attachments
    FROM published_entries e JOIN users u ON u.id=e.author_id
    WHERE e.diary_id=$1 AND (($3='mine' AND e.author_id=$2) OR ($3='vault' AND e.for_vault=true))
      AND ($4::timestamptz IS NULL OR (e.created_at,e.id)<($4::timestamptz,$5::uuid))
    ORDER BY e.created_at DESC,e.id DESC LIMIT 21`,[id,req.user.id,view,cursor?.createdAt||null,cursor?.id||null]);
  const hasMore=entries.rows.length>20; const page=entries.rows.slice(0,20); const last=page.at(-1);
  const nextCursor=hasMore && last ? Buffer.from(JSON.stringify({createdAt:new Date(last.createdAt).toISOString(),id:last.id})).toString('base64url') : null;
  res.json({entries:page,nextCursor});
});
// No update or delete endpoint exists for published entries; return an explicit rejection.
routes.all('/diaries/:id/entries/:entryId',async(req,res)=>{
  await member(req.params.id,req.user.id);
  if(['PUT','PATCH','DELETE'].includes(req.method))throw new AppError(405,'IMMUTABLE','This entry has already been published and cannot be changed.');
  throw missing();
});

routes.post('/diaries/:id/vault/approve',rateLimit('vault-approval',30,3600,true),async(req,res)=>{
  const id=String(req.params.id); z.object({confirm:z.literal(true)}).strict().parse(req.body);
  const outcome=await transaction(async db=>{
    const d=await member(id,req.user.id,db); if(d.kind!=='connected')throw forbidden();
    await db.query('SELECT id FROM diaries WHERE id=$1 FOR UPDATE',[id]);
    const members=await db.query('SELECT user_id FROM diary_members WHERE diary_id=$1',[id]);
    if(members.rows.length!==2)throw conflict('Both people must join before approving the vault.','NOT_CONNECTED');
    const vault=await db.query('SELECT unlocked_at FROM feelings_vault WHERE diary_id=$1 FOR UPDATE',[id]);
    if(vault.rows[0].unlocked_at)return {unlocked:true,already:true};
    await db.query('INSERT INTO vault_approvals(diary_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,req.user.id]);
    const approvals=await db.query('SELECT count(*)::int AS n FROM vault_approvals a JOIN diary_members m ON m.diary_id=a.diary_id AND m.user_id=a.user_id WHERE a.diary_id=$1',[id]);
    const unlocked=approvals.rows[0].n===2;
    if(unlocked)await db.query('UPDATE feelings_vault SET unlocked_at=now() WHERE diary_id=$1',[id]);
    await db.query("INSERT INTO audit_logs(actor_id,diary_id,action,outcome,detail) VALUES($1,$2,'vault.approve','success',$3)",[req.user.id,id,unlocked?'mutual reveal completed':'approval recorded']);
    return {unlocked,already:false};
  });
  res.json(outcome);
});
routes.post('/diaries/:id/streak/break',async(req,res)=>{
  const id=String(req.params.id); z.object({confirm:z.literal(true)}).strict().parse(req.body);
  await transaction(async db=>{
    const d=await member(id,req.user.id,db); if(d.kind!=='connected')throw forbidden();
    await db.query('SELECT id FROM diaries WHERE id=$1 FOR UPDATE',[id]);
    await db.query('UPDATE connection_state SET last_streak_break_at=now() WHERE diary_id=$1',[id]);
    await db.query("INSERT INTO streak_events(diary_id,actor_id,event_type) VALUES($1,$2,'break')",[id,req.user.id]);
    await db.query("INSERT INTO audit_logs(actor_id,diary_id,action,outcome) VALUES($1,$2,'streak.break','success')",[req.user.id,id]);
  });
  res.json({ok:true});
});

routes.post('/diaries/:id/uploads',rateLimit('upload-create',80,3600,true),async(req,res)=>{
  const diaryId=String(req.params.id);const input=uploadSchema.parse(req.body);await member(diaryId,req.user.id);
  const key=`private/${randomBytes(24).toString('hex')}`;
  const upload=await transaction(async db=>{
    const old=await db.query('SELECT * FROM media_uploads WHERE id=$1 FOR UPDATE',[input.id]);
    if(old.rows[0]){
      const u=old.rows[0];
      if(u.diary_id!==diaryId||u.author_id!==req.user.id||u.declared_mime!==input.mime||Number(u.plaintext_size)!==input.size||u.iv!==input.iv)throw conflict('This upload identifier is already in use.');
      if(u.state==='published'||u.state==='deleting')throw conflict('This upload can no longer be changed.');
      return u;
    }
    const inserted=await db.query(`INSERT INTO media_uploads(id,diary_id,author_id,object_key,declared_mime,plaintext_size,ciphertext_size,iv)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[input.id,diaryId,req.user.id,key,input.mime,input.size,input.size+16,input.iv]);
    return inserted.rows[0];
  });
  if(upload.state==='ready')return res.json({id:upload.id,state:'ready'});
  const signed=await presignUpload(upload.object_key,Number(upload.ciphertext_size));
  res.json({id:upload.id,state:'pending',post:signed});
});
routes.post('/uploads/:id/complete',async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const r=await query("SELECT * FROM media_uploads WHERE id=$1 AND author_id=$2 AND state IN ('pending','ready')",[id,req.user.id]);
  if(!r.rows[0])throw missing();
  const u=r.rows[0];await member(u.diary_id,req.user.id);
  if(u.state==='pending'){
    let versionId:string;
    try {versionId=await checkUploaded(u.object_key,Number(u.ciphertext_size));}
    catch {throw conflict('Upload could not be verified. Please retry.','UPLOAD_INCOMPLETE');}
    const updated=await query("UPDATE media_uploads SET state='ready',object_version_id=$3,updated_at=now() WHERE id=$1 AND author_id=$2 AND state='pending' RETURNING id",[id,req.user.id,versionId]);
    if(!updated.rowCount){const fresh=await query('SELECT state FROM media_uploads WHERE id=$1 AND author_id=$2',[id,req.user.id]);if(fresh.rows[0]?.state!=='ready')throw conflict('This upload is no longer available.');}
  }
  res.json({id,state:'ready'});
});
routes.get('/uploads/:id/download',async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const r=await query(`SELECT mu.* FROM media_uploads mu JOIN diary_members m ON m.diary_id=mu.diary_id AND m.user_id=$2
    LEFT JOIN entry_attachments ea ON ea.upload_id=mu.id LEFT JOIN published_entries e ON e.id=ea.entry_id
    LEFT JOIN feelings_vault v ON v.diary_id=mu.diary_id
    WHERE mu.id=$1 AND mu.state IN ('ready','published') AND
      (mu.author_id=$2 OR (mu.state='published' AND e.for_vault=true AND v.unlocked_at IS NOT NULL))`,[id,req.user.id]);
  if(!r.rows[0])throw missing();
  const u=r.rows[0]; res.json({url:await presignDownload(u.object_key,u.object_version_id),iv:u.iv,mime:u.declared_mime,size:Number(u.plaintext_size)});
});

routes.post('/account/deletion-request',rateLimit('deletion-request',3,86400,true),async(req,res)=>{
  z.object({confirm:z.literal(true)}).strict().parse(req.body);
  await transaction(async db=>{
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
    await db.query("INSERT INTO support_requests(user_id,kind) VALUES($1,'deletion')",[req.user.id]);
    await db.query("UPDATE users SET status='deletion_requested',updated_at=now() WHERE id=$1",[req.user.id]);
    await db.query("INSERT INTO audit_logs(actor_id,action,outcome,detail) VALUES($1,'account.deletion_request','success','Account blocked pending controlled review')",[req.user.id]);
  });
  try {await revokeFirebase(req.identity.uid);} catch {console.error(JSON.stringify({level:'warn',event:'token_revocation_deferred'}));}
  res.json({ok:true});
});

const owner=Router();
owner.use(ownerOnly);
owner.get('/overview',async(_req,res)=>{
  const [counts,users,diaries,security,support,accessLogs]=await Promise.all([
    query(`SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM diaries) AS diaries,
      (SELECT count(*)::int FROM published_entries) AS entries,(SELECT coalesce(sum(plaintext_size),0)::bigint FROM media_uploads WHERE state='published') AS storage_bytes`),
    query('SELECT id,display_name,email,status,created_at FROM users ORDER BY created_at DESC LIMIT 100'),
    query('SELECT id,title,kind,created_at FROM diaries ORDER BY created_at DESC LIMIT 100'),
    query('SELECT id,action,outcome,detail,created_at FROM audit_logs ORDER BY id DESC LIMIT 50'),
    query('SELECT s.id,s.kind,s.status,s.created_at,u.display_name FROM support_requests s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 100'),
    query('SELECT r.id,r.diary_id,r.reason,r.success,r.created_at,u.display_name AS owner_name FROM owner_access_requests r JOIN users u ON u.id=r.owner_id ORDER BY r.created_at DESC LIMIT 50')
  ]);
  res.json({counts:counts.rows[0],users:users.rows,diaries:diaries.rows,security:security.rows,support:support.rows,accessLogs:accessLogs.rows});
});
owner.post('/users/:id/status',rateLimit('owner-status',30,3600,true),async(req,res)=>{
  const userId=uuid.parse(req.params.id); const {status}=z.object({status:z.enum(['active','suspended']),confirm:z.literal(true)}).strict().parse(req.body);
  if(userId===req.user.id)throw forbidden();
  const uid=await transaction(async db=>{
    const result=await db.query("UPDATE users SET status=$2,updated_at=now() WHERE id=$1 AND status<>'deletion_requested' RETURNING firebase_uid",[userId,status]);
    if(!result.rows[0])throw missing();
    await db.query("INSERT INTO audit_logs(actor_id,action,outcome,detail) VALUES($1,'owner.account_status','success',$2)",[req.user.id,`Account ${userId} set to ${status}`]);
    return result.rows[0].firebase_uid as string;
  });
  if(status==='suspended')try{await revokeFirebase(uid);}catch{console.error(JSON.stringify({level:'warn',event:'token_revocation_deferred'}));}
  res.json({ok:true});
});
owner.post('/support/:id/status',async(req,res)=>{
  const id=uuid.parse(req.params.id);const {status}=z.object({status:z.enum(['reviewing','closed']),confirm:z.literal(true)}).strict().parse(req.body);
  await transaction(async db=>{const r=await db.query('UPDATE support_requests SET status=$2 WHERE id=$1 RETURNING id',[id,status]);if(!r.rowCount)throw missing();
   await db.query("INSERT INTO audit_logs(actor_id,action,outcome,detail) VALUES($1,'owner.support_status','success',$2)",[req.user.id,`Support request ${id} set to ${status}`]);});res.json({ok:true});
});
owner.post('/access',rateLimit('owner-access-ip',10,3600),rateLimit('owner-access-user',5,3600,true),async(req,res)=>{
  const input=z.object({diaryId:uuid,credential:z.string().min(1).max(512),reason:z.string().trim().min(15).max(500),confirm:z.literal(true),cursor:z.string().max(512).optional()}).strict().parse(req.body);
  let cursor:{createdAt:string;id:string}|null=null;
  if(input.cursor){try{cursor=z.object({createdAt:z.string().datetime({offset:true}),id:uuid}).parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8')));}catch{throw new AppError(400,'INVALID_INPUT','Invalid page cursor.');}}
  const exists=await query('SELECT id FROM diaries WHERE id=$1',[input.diaryId]);
  const diaryId=exists.rows[0]?.id||null;
  let success=false;
  try {
    if(!await verifyOwnerCredential(input.credential)||!diaryId)throw forbidden();
    const envelope=await query("SELECT envelope FROM diary_key_envelopes WHERE diary_id=$1 AND purpose='owner_escrow'",[diaryId]);
    if(!envelope.rows[0])throw missing();
    const key=openOwnerKey(envelope.rows[0].envelope,diaryId);
    try {
      const rows=await query(`SELECT e.id,e.ciphertext,e.created_at,e.for_vault,u.firebase_uid,u.display_name FROM published_entries e
        JOIN users u ON u.id=e.author_id WHERE e.diary_id=$1 AND ($2::timestamptz IS NULL OR (e.created_at,e.id)<($2::timestamptz,$3::uuid))
        ORDER BY e.created_at DESC,e.id DESC LIMIT 51`,[diaryId,cursor?.createdAt||null,cursor?.id||null]);
      const page=rows.rows.slice(0,50);const last=page.at(-1);
      const nextCursor=rows.rows.length>50&&last?Buffer.from(JSON.stringify({createdAt:new Date(last.created_at).toISOString(),id:last.id})).toString('base64url'):null;
      const entries=page.map(e=>({id:e.id,createdAt:e.created_at,forVault:e.for_vault,author:e.display_name,content:decryptEntry(key,diaryId,e.firebase_uid,e.ciphertext)}));
      await transaction(async db=>{
        await db.query('INSERT INTO owner_access_requests(owner_id,diary_id,reason,success) VALUES($1,$2,$3,true)',[req.user.id,diaryId,input.reason]);
        await db.query("INSERT INTO audit_logs(actor_id,diary_id,action,outcome,detail) VALUES($1,$2,'owner.diary_access','success','Authorized published-content access')",[req.user.id,diaryId]);
      });success=true;
      res.json({entries,nextCursor});
    } finally {key.fill(0);}
  } finally {
    if(!success){
      await query('INSERT INTO owner_access_requests(owner_id,diary_id,reason,success) VALUES($1,$2,$3,false)',[req.user.id,diaryId,input.reason]).catch(()=>{});
      await audit(req.user.id,'owner.diary_access','failure',diaryId,'Access denied or unavailable').catch(()=>{});
    }
  }
});
routes.use('/owner',owner);
