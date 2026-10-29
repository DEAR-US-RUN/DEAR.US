import { describe,it,expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createDiaryKey,unlockDiaryKey,encryptContent,decryptContent } from '../../src/crypto';
import { sealOwnerKey,openOwnerKey,decryptEntry } from '../../server/crypto';
import { streakFromDays } from '../../server/helpers';
import { diarySchema,uploadSchema,draftSchema } from '../../server/validation';

describe('envelope encryption',()=>{
 it('round trips a diary key and binds content to the diary and author',async()=>{
  const id=crypto.randomUUID(),password='a unique long test passphrase';const {key,envelope,escrowKey}=await createDiaryKey(id,password);
  const unlocked=await unlockDiaryKey(id,password,envelope);const encrypted=await encryptContent(key,id,'alice',{title:'a private sentence',body:'hello',attachments:[]});
  expect(JSON.stringify(encrypted)).not.toContain('a private sentence');
  expect(await decryptContent(unlocked,id,'alice',encrypted)).toEqual({title:'a private sentence',body:'hello',attachments:[]});
  await expect(unlockDiaryKey(id,'wrong passphrase',envelope)).rejects.toThrow();
  await expect(decryptContent(unlocked,id,'bob',encrypted)).rejects.toThrow();
  await expect(decryptContent(unlocked,crypto.randomUUID(),'alice',encrypted)).rejects.toThrow();
  process.env.OWNER_ESCROW_KEY=randomBytes(32).toString('base64');const owner=sealOwnerKey(escrowKey,id),raw=openOwnerKey(owner,id);
  expect(decryptEntry(raw,id,'alice',encrypted)).toEqual({title:'a private sentence',body:'hello',attachments:[]});raw.fill(0);
  expect(()=>openOwnerKey(owner,crypto.randomUUID())).toThrow();
 });
 it('detects ciphertext tampering',async()=>{
  const id=crypto.randomUUID(),{key}=await createDiaryKey(id,'correct horse battery staple');const encrypted=await encryptContent(key,id,'alice',{body:'original'});
  const bytes=Uint8Array.from(atob(encrypted.data),x=>x.charCodeAt(0));bytes[0]^=1;encrypted.data=btoa(String.fromCharCode(...bytes));
  await expect(decryptContent(key,id,'alice',encrypted)).rejects.toThrow();
 });
});
describe('streaks and validation',()=>{
 it('counts consecutive publication days including today or yesterday, never application visits',()=>{
  const now=new Date('2026-10-29T12:00:00Z');
  expect(streakFromDays(['2026-10-29','2026-10-28','2026-10-27','2026-10-25'],now)).toBe(3);
  expect(streakFromDays(['2026-10-28','2026-10-27'],now)).toBe(2);
  expect(streakFromDays(['2026-10-27'],now)).toBe(0);expect(streakFromDays([],now)).toBe(0);
 });
 it('rejects malformed uploads and draft inputs',()=>{
  expect(uploadSchema.safeParse({id:'bad',mime:'image/svg+xml',size:9e9,iv:'bad'}).success).toBe(false);
  expect(draftSchema.safeParse({expectedVersion:-1,forVault:'true'}).success).toBe(false);
  expect(diarySchema.safeParse({title:'x'}).success).toBe(false);
 });
});

describe('calendar dates',()=>{
 it('formats a date-only target without shifting it into a prior day',async()=>{
  const {dateLabel}=await import('../../src/format');const old=process.env.TZ;process.env.TZ='America/Los_Angeles';
  expect(dateLabel('2026-12-25',{month:'long',day:'numeric',year:'numeric'})).toContain('25');process.env.TZ=old;
 });
});
