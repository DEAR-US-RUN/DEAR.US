import { auth } from './firebase';
export class ApiError extends Error {constructor(public code:string,message:string,public status:number){super(message);}}
function sessionExpired(){if(typeof window!=='undefined')window.dispatchEvent(new Event('dear-us:session-expired'));return new ApiError('UNAUTHENTICATED','Your session expired. Sign in again.',401);}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const user=auth?.currentUser;if(!user)throw sessionExpired();
 let token:string;try{token=await user.getIdToken();}catch{throw sessionExpired();}
 const run=async()=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try {return await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,...options.headers},signal:controller.signal,credentials:'omit'});}finally{clearTimeout(timer);}
 };
 let response:Response;
 try {response=await run();if(response.status===401){try{token=await user.getIdToken(true);}catch{throw sessionExpired();}response=await run();}}
 catch(e) {if(e instanceof ApiError)throw e;throw new ApiError('NETWORK_ERROR','Could not reach the service. Check your connection and retry.',0);}
 if(response.status===401)throw sessionExpired();
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new ApiError(data.error?.code||'REQUEST_FAILED',data.error?.message||'Something went wrong. Please try again.',response.status);
 return data as T;
}
export const post=<T,>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
