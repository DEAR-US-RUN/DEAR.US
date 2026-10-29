import type { Ciphertext, PasswordEnvelope } from './types';
const encoder=new TextEncoder();const decoder=new TextDecoder();
export function toB64(bytes:Uint8Array):string {let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
export function fromB64(value:string):Uint8Array<ArrayBuffer> {const binary=atob(value);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
function random(n:number):Uint8Array<ArrayBuffer>{return crypto.getRandomValues(new Uint8Array(n));}
async function passwordKey(password:string,salt:Uint8Array<ArrayBuffer>) {
  const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function createDiaryKey(diaryId:string,password:string):Promise<{key:CryptoKey;envelope:PasswordEnvelope;escrowKey:string}> {
  const raw=random(32),salt=random(16),iv=random(12);const derived=await passwordKey(password,salt);
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`dear-us:password:v1:${diaryId}`)},derived,raw);
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  const escrowKey=toB64(raw);raw.fill(0);
  return {key,escrowKey,envelope:{v:1,kdf:'PBKDF2-SHA256',iterations:600000,salt:toB64(salt),iv:toB64(iv),data:toB64(new Uint8Array(data))}};
}
export async function unlockDiaryKey(diaryId:string,password:string,envelope:PasswordEnvelope):Promise<CryptoKey> {
  if(envelope.v!==1||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==600000)throw new Error('Unsupported key envelope.');
  const derived=await passwordKey(password,fromB64(envelope.salt));
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(envelope.iv),additionalData:encoder.encode(`dear-us:password:v1:${diaryId}`)},derived,fromB64(envelope.data));
  const bytes=new Uint8Array(raw);try{return await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}finally{bytes.fill(0);}
}
export async function encryptContent(key:CryptoKey,diaryId:string,authorUid:string,value:unknown):Promise<Ciphertext> {
 const iv=random(12);const bytes=encoder.encode(JSON.stringify(value));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`dear-us:content:v1:${diaryId}:${authorUid}`)},key,bytes);
 return {v:1,iv:toB64(iv),data:toB64(new Uint8Array(data))};
}
export async function decryptContent<T>(key:CryptoKey,diaryId:string,authorUid:string,ciphertext:Ciphertext):Promise<T> {
 if(ciphertext.v!==1)throw new Error('Unsupported encryption version.');
 const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(ciphertext.iv),additionalData:encoder.encode(`dear-us:content:v1:${diaryId}:${authorUid}`)},key,fromB64(ciphertext.data));
 return JSON.parse(decoder.decode(data)) as T;
}
export async function encryptMedia(key:CryptoKey,diaryId:string,uploadId:string,file:File) {
 const iv=random(12), plaintext=await file.arrayBuffer();
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`dear-us:media:v1:${diaryId}:${uploadId}`)},key,plaintext);
 return {iv:toB64(iv),ciphertext};
}
export async function decryptMedia(key:CryptoKey,diaryId:string,uploadId:string,iv:string,data:ArrayBuffer) {
 return crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(iv),additionalData:encoder.encode(`dear-us:media:v1:${diaryId}:${uploadId}`)},key,data);
}
