import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { randomBytes,scryptSync } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
vi.mock('../../server/storage',()=>({
 presignUpload:async()=>({url:'https://storage.invalid/upload',fields:{key:'test'}}),
 checkUploaded:async()=> 'version-immutable-1',
 presignDownload:async(_key:string,version:string)=>`https://storage.invalid/object?version=${version}`,
 deleteObject:async()=>{},
}));
import { createApp } from '../../server/app';
import { closePool } from '../../server/db';
import { createDiaryKey,encryptContent } from '../../src/crypto';
import type { Identity } from '../../server/auth';

const runtime=process.env.TEST_DATABASE_URL,adminUrl=process.env.TEST_MIGRATION_DATABASE_URL;
let enabled=false;
try {
 if(runtime&&adminUrl&&process.env.ALLOW_DESTRUCTIVE_TEST_DB==='1') {
  const r=new URL(runtime),a=new URL(adminUrl);const local=['127.0.0.1','localhost','[::1]'];
  enabled=local.includes(r.hostname)&&local.includes(a.hostname)&&r.hostname===a.hostname&&r.port===a.port&&r.pathname===a.pathname&&/test/i.test(a.pathname);
 }
} catch { /* invalid connection strings are not safe test targets */ }
if(!enabled)throw new Error('Integration tests require matching local TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL for a disposable database named test, plus ALLOW_DESTRUCTIVE_TEST_DB=1. These tests TRUNCATE tables.');
const suite=describe.sequential;
let admin:Pool;
let app:ReturnType<typeof createApp>;
const credential='only-for-test-owner-credential';
let connectedId='',personalId='',inviteToken='',aliceId='',bobId='',charlieId='';
const draftIds=new Map<string,string>();
let connectedKey:CryptoKey,privateEntryId='',privateAttachmentId='',vaultAttachmentId='',vaultAliceId='',firstRequestId='';
const uidFor=(token:string)=>token.startsWith('owner')?'owner':token;
async function sync(token:string){return request(app).post('/api/auth/sync').set('Authorization',`Bearer ${token}`).send({});}
const auth=(token:string)=>`Bearer ${token}`;
async function createDiary(token:string,kind:'personal'|'connected',targetMode:'none'|'duration'='none'){
 const id=crypto.randomUUID();const secrets=await createDiaryKey(id,'long unique diary password');
 const body={id,title:`${kind} diary`,kind,...(kind==='connected'?{relationshipLabel:'partner',otherName:'Friend'}:{}),targetMode,...(targetMode==='duration'?{targetDuration:30}:{}),passwordEnvelope:secrets.envelope,escrowKey:secrets.escrowKey};
 const response=await request(app).post('/api/diaries').set('Authorization',auth(token)).send(body);
 return {id,key:secrets.key,response};
}
async function save(token:string,diaryId:string,key:CryptoKey,content:string,version:number,forVault=false,attachmentIds:string[]=[],operationId=crypto.randomUUID()){
 const ciphertext=await encryptContent(key,diaryId,uidFor(token),{title:content,body:content,attachments:[]});
 const result=await request(app).put(`/api/diaries/${diaryId}/draft`).set('Authorization',auth(token)).send({operationId,expectedVersion:version,ciphertext,entryType:attachmentIds.length?'photo':'text',forVault,attachmentIds});
 if(result.status===200)draftIds.set(`${token}:${diaryId}`,result.body.draftId);return result;
}
async function publish(token:string,diaryId:string,version:number,requestId:string=crypto.randomUUID()){
 return request(app).post(`/api/diaries/${diaryId}/entries`).set('Authorization',auth(token)).send({requestId,draftId:draftIds.get(`${token}:${diaryId}`),expectedVersion:version,confirm:true});
}
async function stagedUpload(diaryId:string,authorId:string){
 const id=crypto.randomUUID();await admin.query(`INSERT INTO media_uploads(id,diary_id,author_id,object_key,declared_mime,plaintext_size,ciphertext_size,iv,object_version_id,state)
 VALUES($1,$2,$3,$4,'image/jpeg',100,116,$5,'version-immutable-1','ready')`,[id,diaryId,authorId,`test/${id}`,Buffer.alloc(12).toString('base64')]);return id;
}
suite('authenticated API with real PostgreSQL and a test-only token verifier',()=>{
 beforeAll(async()=>{
  process.env.DATABASE_URL=runtime!;process.env.OWNER_ESCROW_KEY=randomBytes(32).toString('base64');process.env.OWNER_UIDS='owner';process.env.CRON_SECRET='only-for-local-cron-test';
  const salt=randomBytes(16),hash=scryptSync(credential,salt,32,{N:16384,r:8,p:1});process.env.OWNER_CREDENTIAL_SCRYPT=`scrypt:16384:8:1:${salt.toString('base64')}:${hash.toString('base64')}`;
  admin=new Pool({connectionString:adminUrl,max:2});
  await admin.query('TRUNCATE users,rate_limits RESTART IDENTITY CASCADE');
  const verify=async(token:string):Promise<Identity>=>{
   if(token==='invalid'||token==='revoked')throw new Error('rejected');
   const uid=uidFor(token);return {uid,email:`${uid}@example.test`,name:uid,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'google.com',...(token==='owner-mfa'?{sign_in_second_factor:'totp'}:token==='owner-sms'?{sign_in_second_factor:'phone'}:{})}};
  };
  app=createApp({verifyIdToken:verify});
 });
 afterAll(async()=>{await closePool();await admin?.end();});
 it('verifies authentication, rejects bad sessions and does not duplicate Firebase UIDs',async()=>{
  expect((await request(app).get('/api/me')).status).toBe(401);
  expect((await sync('invalid')).status).toBe(401);expect((await sync('revoked')).status).toBe(401);
  for(const token of ['alice','bob','charlie','owner-mfa'])expect((await sync(token)).status).toBe(200);
  expect((await sync('alice')).status).toBe(200);
  const rows=await admin.query("SELECT id,firebase_uid FROM users WHERE firebase_uid IN ('alice','bob','charlie')");
  expect(rows.rowCount).toBe(3);aliceId=rows.rows.find(r=>r.firebase_uid==='alice').id;bobId=rows.rows.find(r=>r.firebase_uid==='bob').id;charlieId=rows.rows.find(r=>r.firebase_uid==='charlie').id;
  expect((await request(app).post('/api/auth/sync').set('Authorization',auth('alice')).send({uid:'bob'})).status).toBe(400);
 });
 it('creates a connected diary without a target lock and denies unauthorized IDs',async()=>{
  const c=await createDiary('alice','connected','duration');connectedId=c.id;connectedKey=c.key;
  expect(c.response.status).toBe(201);expect(c.response.body.diary.targetDate).toBeNull();
  expect((await request(app).get(`/api/diaries/${connectedId}`).set('Authorization',auth('alice'))).status).toBe(200);
  expect((await request(app).get(`/api/diaries/${connectedId}`).set('Authorization',auth('bob'))).status).toBe(404);
  const inv=await request(app).post(`/api/diaries/${connectedId}/invitations`).set('Authorization',auth('alice')).send({});expect(inv.status).toBe(201);inviteToken=inv.body.token;
  expect(inviteToken).toHaveLength(43);
 });
 it('accepts an invitation once, computes a duration target after joining, and excludes a third member',async()=>{
  const accept=await request(app).post('/api/invitations/accept').set('Authorization',auth('bob')).send({token:inviteToken});expect(accept.status).toBe(200);
  expect(accept.body.diary.members).toHaveLength(2);expect(accept.body.diary.remainingDays).toBe(30);expect(accept.body.diary.unlockedAt).toBeNull();
  expect((await request(app).get(`/api/diaries/${connectedId}`).set('Authorization',auth('bob'))).status).toBe(200);
  expect((await request(app).post('/api/invitations/accept').set('Authorization',auth('charlie')).send({token:inviteToken})).status).toBe(404);
  expect((await request(app).get(`/api/diaries/${connectedId}`).set('Authorization',auth('charlie'))).status).toBe(404);
  await expect(admin.query("INSERT INTO diary_members(diary_id,user_id,role) VALUES($1,$2,'member')",[connectedId,charlieId])).rejects.toMatchObject({code:'23514'});
 });
 it('enforces two spaces and personal diary permissions at the backend',async()=>{
  const p=await createDiary('alice','personal');personalId=p.id;expect(p.response.status).toBe(201);
  expect((await createDiary('alice','personal')).response.status).toBe(409);
  expect((await request(app).get(`/api/diaries/${personalId}`).set('Authorization',auth('bob'))).status).toBe(404);
  expect((await request(app).post(`/api/diaries/${personalId}/invitations`).set('Authorization',auth('alice')).send({})).status).toBe(403);
  expect((await request(app).post(`/api/diaries/${personalId}/vault/approve`).set('Authorization',auth('alice')).send({confirm:true})).status).toBe(403);
 });
 it('persists drafts separately, rejects stale saves, and publishes atomically and idempotently',async()=>{
  const op=crypto.randomUUID();const ciphertext=await encryptContent(connectedKey,connectedId,'alice',{title:'Private words',body:'Private words',attachments:[]});
  const payload={operationId:op,expectedVersion:0,ciphertext,entryType:'text',forVault:false,attachmentIds:[]};
  const saved=await request(app).put(`/api/diaries/${connectedId}/draft`).set('Authorization',auth('alice')).send(payload);expect(saved.status).toBe(200);expect(saved.body.version).toBe(1);draftIds.set(`alice:${connectedId}`,saved.body.draftId);
  const replay=await request(app).put(`/api/diaries/${connectedId}/draft`).set('Authorization',auth('alice')).send(payload);expect(replay.status).toBe(200);expect(replay.body.repeated).toBe(true);
  const misuse=await request(app).put(`/api/diaries/${connectedId}/draft`).set('Authorization',auth('alice')).send({...payload,forVault:true});expect(misuse.status).toBe(409);
  const recovered=await request(app).get(`/api/diaries/${connectedId}/draft`).set('Authorization',auth('alice'));expect(recovered.body.draft.version).toBe(1);expect(JSON.stringify(recovered.body)).not.toContain('Private words');
  const otherDraft=await request(app).get(`/api/diaries/${connectedId}/draft`).set('Authorization',auth('bob'));expect(otherDraft.body.draft).toBeNull();
  expect((await save('alice',connectedId,connectedKey,'Stale overwrite',0)).status).toBe(409);
  const requestId=crypto.randomUUID();firstRequestId=requestId;const one=await publish('alice',connectedId,1,requestId);expect(one.status).toBe(201);privateEntryId=one.body.entry.id;
  const repeat=await publish('alice',connectedId,1,requestId);expect(repeat.status).toBe(200);expect(repeat.body.entry.id).toBe(privateEntryId);
  expect((await publish('alice',connectedId,1)).status).toBe(409);
  expect((await request(app).patch(`/api/diaries/${connectedId}/entries/${privateEntryId}`).set('Authorization',auth('alice')).send({body:'changed'})).status).toBe(405);
  expect((await request(app).delete(`/api/diaries/${connectedId}/entries/${privateEntryId}`).set('Authorization',auth('alice'))).status).toBe(405);
  await expect(admin.query("UPDATE published_entries SET entry_type='video' WHERE id=$1",[privateEntryId])).rejects.toMatchObject({code:'55000'});
  await expect(admin.query('DELETE FROM published_entries WHERE id=$1',[privateEntryId])).rejects.toMatchObject({code:'55000'});
  expect((await request(app).get(`/api/diaries/${connectedId}/draft`).set('Authorization',auth('alice'))).body.draft).toBeNull();
  expect((await request(app).get(`/api/diaries/${connectedId}/entries?view=mine`).set('Authorization',auth('bob'))).body.entries).toHaveLength(0);
 });
 it('keeps private attachments private and pins the published object version',async()=>{
  privateAttachmentId=await stagedUpload(connectedId,aliceId);
  expect((await save('alice',connectedId,connectedKey,'Private photo',0,false,[privateAttachmentId])).status).toBe(200);
  expect((await publish('alice',connectedId,1,firstRequestId)).status).toBe(409);
  expect((await publish('alice',connectedId,1)).status).toBe(201);
  const owner=await request(app).get(`/api/uploads/${privateAttachmentId}/download`).set('Authorization',auth('alice'));expect(owner.status).toBe(200);expect(owner.body.url).toContain('version-immutable-1');
  expect((await request(app).get(`/api/uploads/${privateAttachmentId}/download`).set('Authorization',auth('bob'))).status).toBe(404);
  await expect(admin.query("UPDATE media_uploads SET object_version_id='tampered' WHERE id=$1",[privateAttachmentId])).rejects.toMatchObject({code:'55000'});
 });
 it('requires two independent current member approvals before revealing only designated entries',async()=>{
  vaultAttachmentId=await stagedUpload(connectedId,aliceId);
  expect((await save('alice',connectedId,connectedKey,'Alice vault',0,true,[vaultAttachmentId])).status).toBe(200);
  const a=await publish('alice',connectedId,1);expect(a.status).toBe(201);vaultAliceId=a.body.entry.id;
  expect((await save('bob',connectedId,connectedKey,'Bob vault',0,true)).status).toBe(200);expect((await publish('bob',connectedId,1)).status).toBe(201);
  expect((await request(app).get(`/api/diaries/${connectedId}/entries?view=vault`).set('Authorization',auth('bob'))).status).toBe(403);
  expect((await request(app).get(`/api/uploads/${vaultAttachmentId}/download`).set('Authorization',auth('bob'))).status).toBe(404);
  const first=await request(app).post(`/api/diaries/${connectedId}/vault/approve`).set('Authorization',auth('alice')).send({confirm:true});expect(first.body.unlocked).toBe(false);
  const duplicate=await request(app).post(`/api/diaries/${connectedId}/vault/approve`).set('Authorization',auth('alice')).send({confirm:true});expect(duplicate.body.unlocked).toBe(false);
  expect((await request(app).post(`/api/diaries/${connectedId}/vault/approve`).set('Authorization',auth('charlie')).send({confirm:true})).status).toBe(404);
  const second=await request(app).post(`/api/diaries/${connectedId}/vault/approve`).set('Authorization',auth('bob')).send({confirm:true});expect(second.body.unlocked).toBe(true);
  const revealed=await request(app).get(`/api/diaries/${connectedId}/entries?view=vault`).set('Authorization',auth('bob'));expect(revealed.status).toBe(200);expect(revealed.body.entries).toHaveLength(2);
  expect(revealed.body.entries.map((e:any)=>e.id)).toContain(vaultAliceId);expect(revealed.body.entries.map((e:any)=>e.id)).not.toContain(privateEntryId);
  expect((await request(app).get(`/api/uploads/${vaultAttachmentId}/download`).set('Authorization',auth('bob'))).status).toBe(200);
  expect((await request(app).get(`/api/uploads/${privateAttachmentId}/download`).set('Authorization',auth('bob'))).status).toBe(404);
  expect((await save('alice',connectedId,connectedKey,'New vault after reveal',0,true)).status).toBe(409);
 });
 it('records an optional streak reset without deleting entries',async()=>{
  const before=await request(app).get(`/api/diaries/${connectedId}`).set('Authorization',auth('alice'));expect(before.body.diary.streak).toBe(1);
  expect((await request(app).post(`/api/diaries/${connectedId}/streak/break`).set('Authorization',auth('alice')).send({confirm:true})).status).toBe(200);
  const after=await request(app).get(`/api/diaries/${connectedId}`).set('Authorization',auth('alice'));expect(after.body.diary.streak).toBe(0);
  expect((await admin.query('SELECT count(*)::int n FROM published_entries WHERE diary_id=$1',[connectedId])).rows[0].n).toBe(4);
 });
 it('requires owner MFA, separate credential, reason and audit records',async()=>{
  expect((await request(app).get('/api/owner/overview').set('Authorization',auth('alice'))).status).toBe(403);
  expect((await request(app).get('/api/owner/overview').set('Authorization',auth('owner-plain'))).status).toBe(403);
  expect((await request(app).get('/api/owner/overview').set('Authorization',auth('owner-mfa'))).status).toBe(200);
  const base={diaryId:connectedId,reason:'An authorized support investigation',confirm:true};
  expect((await request(app).post('/api/owner/access').set('Authorization',auth('owner-mfa')).send({...base,credential:'incorrect'})).status).toBe(403);
  const opened=await request(app).post('/api/owner/access').set('Authorization',auth('owner-mfa')).send({...base,credential});expect(opened.status).toBe(200);expect(opened.body.entries.some((e:any)=>e.content.title==='Private words')).toBe(true);expect(opened.body.escrowKey).toBeUndefined();
  const audit=await admin.query("SELECT success FROM owner_access_requests WHERE diary_id=$1 ORDER BY created_at",[connectedId]);expect(audit.rows.map(r=>r.success)).toEqual([false,true]);
  const overview=await request(app).get('/api/owner/overview').set('Authorization',auth('owner-mfa'));expect(overview.body.accessLogs).toHaveLength(2);expect(overview.body.accessLogs[0].reason).toBe(base.reason);
 });
 it('protects cleanup and retains draft-referenced and published attachments',async()=>{
  const orphan=await stagedUpload(connectedId,aliceId),referenced=await stagedUpload(connectedId,aliceId);
  await admin.query("UPDATE media_uploads SET created_at=now()-interval '2 days' WHERE id=ANY($1::uuid[])",[[orphan,referenced]]);
  expect((await save('alice',connectedId,connectedKey,'A draft with a file',0,false,[referenced])).status).toBe(200);
  expect((await request(app).get('/api/cron/cleanup')).status).toBe(401);
  expect((await request(app).get('/api/cron/cleanup').set('Authorization','Bearer only-for-local-cron-test')).status).toBe(200);
  expect((await admin.query('SELECT id FROM media_uploads WHERE id=$1',[orphan])).rowCount).toBe(0);
  expect((await admin.query('SELECT id FROM media_uploads WHERE id=$1',[referenced])).rowCount).toBe(1);
  expect((await admin.query('SELECT id FROM media_uploads WHERE id=$1',[privateAttachmentId])).rowCount).toBe(1);
 });
 it('audits account controls and immediately rejects suspended users',async()=>{
  expect((await request(app).post(`/api/owner/users/${bobId}/status`).set('Authorization',auth('owner-mfa')).send({status:'suspended',confirm:true})).status).toBe(200);
  expect((await request(app).get('/api/me').set('Authorization',auth('bob'))).status).toBe(403);
  expect((await request(app).post(`/api/owner/users/${bobId}/status`).set('Authorization',auth('owner-mfa')).send({status:'active',confirm:true})).status).toBe(200);
  expect((await request(app).get('/api/me').set('Authorization',auth('bob'))).status).toBe(200);
  expect((await admin.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='owner.account_status'")).rows[0].n).toBe(2);
 });
 it('rejects expired and malformed invitations and applies rate limits',async()=>{
  const malformed=await request(app).post('/api/invitations/accept').set('Authorization',auth('charlie')).send({token:'bad'});expect(malformed.status).toBe(400);
  const inv=await createDiary('charlie','connected');expect(inv.response.status).toBe(201);
  const created=await request(app).post(`/api/diaries/${inv.id}/invitations`).set('Authorization',auth('charlie')).send({});
  const {createHash}=await import('node:crypto');const hash=createHash('sha256').update(created.body.token).digest('hex');await admin.query("UPDATE diary_invitations SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[hash]);
  expect((await request(app).post('/api/invitations/accept').set('Authorization',auth('bob')).send({token:created.body.token})).status).toBe(404);
  let limited=false;for(let i=0;i<13;i++){const r=await request(app).post('/api/invitations/accept').set('Authorization',auth('bob')).send({token:'a'.repeat(43)});if(r.status===429){limited=true;break;}}expect(limited).toBe(true);
 });
 it('serializes competing invitation acceptance, allowing at most two members',async()=>{
  for(const t of ['diana','eve','frank'])expect((await sync(t)).status).toBe(200);
  const d=await createDiary('diana','connected');expect(d.response.status).toBe(201);
  const inv=await request(app).post(`/api/diaries/${d.id}/invitations`).set('Authorization',auth('diana')).send({});
  const outcomes=await Promise.all(['eve','frank'].map(t=>request(app).post('/api/invitations/accept').set('Authorization',auth(t)).send({token:inv.body.token})));
  expect(outcomes.filter(r=>r.status===200)).toHaveLength(1);expect((await admin.query('SELECT count(*)::int n FROM diary_members WHERE diary_id=$1',[d.id])).rows[0].n).toBe(2);
 });
 it('records a deletion request and blocks the app account without pretending data was erased',async()=>{
  expect((await request(app).post('/api/account/deletion-request').set('Authorization',auth('charlie')).send({confirm:true})).status).toBe(200);
  expect((await request(app).get('/api/me').set('Authorization',auth('charlie'))).status).toBe(403);
  expect((await admin.query("SELECT count(*)::int n FROM support_requests WHERE user_id=$1 AND kind='deletion'",[charlieId])).rows[0].n).toBe(1);
 });
});
