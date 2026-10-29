import { beforeEach,describe,expect,it,vi } from 'vitest';
vi.mock('../../src/api',()=>{
 class ApiError extends Error {constructor(public code:string,message:string,public status:number){super(message);}}
 return {ApiError,api:vi.fn(),post:vi.fn()};
});
import { api,ApiError,post } from '../../src/api';
import { DraftManager } from '../../src/drafts';
import { decryptContent } from '../../src/crypto';
import type { Ciphertext } from '../../src/types';
class MemoryStorage {
 private values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]||null;}
 getItem(k:string){return this.values.get(k)||null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();}
}
const store=new MemoryStorage();
beforeEach(()=>{store.clear();vi.clearAllMocks();vi.stubGlobal('localStorage',store);});
const snap=(text:string)=>({title:text,body:text,attachments:[],forVault:false});
async function key(){return crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);}

describe('automatic draft recovery',()=>{
 it('serializes saves so an older response cannot replace newer typing',async()=>{
  const k=await key(),id=crypto.randomUUID();let version=0;let release!:()=>void;const first=new Promise<void>(r=>release=r);const writes:{ciphertext:Ciphertext;expectedVersion:number}[]=[];
  vi.mocked(api).mockImplementation(async(_path,options)=>{
   if(!options)return {draft:null} as never;
   const body=JSON.parse(String(options.body));writes.push(body);if(writes.length===1)await first;
   expect(body.expectedVersion).toBe(version);version++;return {draftId:'00000000-0000-4000-8000-000000000001',version,currentVersion:version} as never;
  });
  const manager=new DraftManager(id,'alice',k,()=>{});let last:any;manager.subscribe(v=>last=v);await manager.init();expect(last.status).toBe('idle');
  manager.change(snap('first'));const saving=manager.save();
  await vi.waitFor(()=>expect(writes.length).toBe(1));manager.change(snap('newer'));release();await saving;
  expect(writes).toHaveLength(2);expect(await decryptContent(k,id,'alice',writes[1].ciphertext)).toEqual({title:'newer',body:'newer',attachments:[]});expect(last.status).toBe('saved');expect(last.version).toBe(2);manager.dispose();
 });
 it('recovers encrypted unsent work after an offline refresh and never stores plaintext',async()=>{
  const k=await key(),id=crypto.randomUUID();let online=true;
  vi.mocked(api).mockImplementation(async(_path,options)=>{if(!options){if(!online)throw new ApiError('NETWORK_ERROR','offline',0);return {draft:null} as never;}throw new ApiError('NETWORK_ERROR','offline',0);});
  const first=new DraftManager(id,'alice',k,()=>{});await first.init();first.change(snap('the private recovery sentence'));await expect(first.save()).rejects.toThrow();
  const stored=store.getItem(store.key(0)!);expect(stored).toBeTruthy();expect(stored).not.toContain('the private recovery sentence');first.dispose();
  online=false;const second=new DraftManager(id,'alice',k,()=>{});let view:any;second.subscribe(v=>view=v);await second.init();expect(view.snapshot.body).toBe('the private recovery sentence');expect(view.status).toBe('error');expect(view.recoverable).toBe(true);second.dispose();
 });
 it('keeps a conflicting tab’s encrypted copy and only rebases after explicit action',async()=>{
  const k=await key(),id=crypto.randomUUID();let version=0;
  vi.mocked(api).mockImplementation(async(_path,options)=>{
   if(!options)return {draft:version?{version,ciphertext:null}:null} as never;
   const body=JSON.parse(String(options.body));if(body.expectedVersion!==version)throw new ApiError('DRAFT_CONFLICT','Changed in another tab',409);
   version++;return {draftId:'00000000-0000-4000-8000-000000000001',version,currentVersion:version} as never;
  });
  const manager=new DraftManager(id,'alice',k,()=>{});let view:any;manager.subscribe(v=>view=v);await manager.init();manager.change(snap('my copy'));version=1;
  await expect(manager.save()).rejects.toThrow();expect(view.status).toBe('conflict');expect(store.getItem(store.key(0)!)).not.toContain('my copy');
  await manager.rebase();expect(version).toBe(2);expect(view.status).toBe('saved');manager.dispose();
 });
 it('retains a stable publish request after an ambiguous network failure',async()=>{
  const k=await key(),id=crypto.randomUUID();let version=0;
  vi.mocked(api).mockImplementation(async(_path,options)=>{if(!options)return {draft:null} as never;version++;return {draftId:'00000000-0000-4000-8000-000000000001',version,currentVersion:version} as never;});
  vi.mocked(post).mockRejectedValueOnce(new ApiError('NETWORK_ERROR','offline',0)).mockResolvedValueOnce({entry:{id:'published'}} as never);
  const manager=new DraftManager(id,'alice',k,()=>{});let view:any;manager.subscribe(v=>view=v);await manager.init();manager.change(snap('keep me'));const requestId=crypto.randomUUID();
  await expect(manager.publish(requestId)).rejects.toThrow();expect(view.publishPending).toBe(true);
  manager.change(snap('should not overwrite pending publish'));expect(manager.getSnapshot().title).toBe('keep me');
  await manager.publish(crypto.randomUUID());expect(vi.mocked(post).mock.calls[1][1]).toMatchObject({requestId,expectedVersion:1,confirm:true});manager.dispose();
 });
});
