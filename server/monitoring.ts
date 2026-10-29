/** Optional redacted operational alert. No request, body, URL, stack, user or SQL is sent. */
export async function reportOperationalFailure(errorClass:string) {
 const endpoint=process.env.MONITORING_WEBHOOK_URL;if(!endpoint)return;
 try {
  const url=new URL(endpoint);if(url.protocol!=='https:')return;
  await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'dear-us',event:'request_failed',errorClass:errorClass.replace(/[^A-Za-z0-9_]/g,'').slice(0,80),at:new Date().toISOString()}),signal:AbortSignal.timeout(1200)});
 }catch{/* Monitoring is best effort and must never include the original error or request. */}
}
