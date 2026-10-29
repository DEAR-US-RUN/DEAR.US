import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
function escrowKey() {
  const key = Buffer.from(process.env.OWNER_ESCROW_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('OWNER_ESCROW_NOT_CONFIGURED');
  return key;
}
export function sealOwnerKey(rawKeyB64: string, diaryId: string) {
  const rawKey = Buffer.from(rawKeyB64, 'base64');
  if (rawKey.length !== 32) throw new Error('Invalid key length');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', escrowKey(), iv);
  cipher.setAAD(Buffer.from(`dear-us:escrow:v1:${diaryId}`));
  const data = Buffer.concat([cipher.update(rawKey), cipher.final(), cipher.getAuthTag()]);
  rawKey.fill(0);
  return {v:1, iv:iv.toString('base64'), data:data.toString('base64')};
}
export function openOwnerKey(envelope: {iv:string;data:string}, diaryId: string) {
  const data=Buffer.from(envelope.data,'base64');
  const decipher=createDecipheriv('aes-256-gcm',escrowKey(),Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(Buffer.from(`dear-us:escrow:v1:${diaryId}`)); decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([decipher.update(data.subarray(0,-16)),decipher.final()]);
}
export function decryptEntry(key: Buffer, diaryId: string, authorUid: string, ciphertext: {iv:string;data:string}) {
  const data=Buffer.from(ciphertext.data,'base64');
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(ciphertext.iv,'base64'));
  d.setAAD(Buffer.from(`dear-us:content:v1:${diaryId}:${authorUid}`)); d.setAuthTag(data.subarray(-16));
  return JSON.parse(Buffer.concat([d.update(data.subarray(0,-16)),d.final()]).toString('utf8'));
}
export async function verifyOwnerCredential(candidate: string): Promise<boolean> {
  const val=process.env.OWNER_CREDENTIAL_SCRYPT;
  if (!val) throw new Error('OWNER_CREDENTIAL_NOT_CONFIGURED');
  const [kind,ns,rs,ps,salt64,hash64]=val.split(':');
  const n=Number(ns),r=Number(rs),p=Number(ps),salt=Buffer.from(salt64||'','base64'),hash=Buffer.from(hash64||'','base64');
  if (kind!=='scrypt'||n!==16384||r!==8||p!==1||salt.length<16||hash.length!==32) throw new Error('OWNER_CREDENTIAL_NOT_CONFIGURED');
  const actual=await new Promise<Buffer>((resolve,reject)=>scryptCallback(candidate,salt,32,{N:n,r,p},(err,key)=>err?reject(err):resolve(key as Buffer)));
  return timingSafeEqual(hash,actual);
}
export function safeSecretEquals(a: string, b: string) {
  const aa=Buffer.from(a);const bb=Buffer.from(b);
  return aa.length>0 && aa.length===bb.length && timingSafeEqual(aa,bb);
}
