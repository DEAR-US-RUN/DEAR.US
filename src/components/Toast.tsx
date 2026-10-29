import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
type Variant='success'|'error'|'warning'|'info';
type Item={id:string;message:string;variant:Variant};
const Ctx=createContext<{notify:(message:string,variant?:Variant)=>void}>({notify:()=>{}});
export function ToastProvider({children}:{children:ReactNode}){
 const [items,setItems]=useState<Item[]>([]);
 const remove=(id:string)=>setItems(old=>old.filter(i=>i.id!==id));
 const notify=useCallback((message:string,variant:Variant='info')=>{
  const id=crypto.randomUUID();setItems(old=>[...old.filter(i=>i.message!==message),{id,message,variant}]);
  if(variant!=='error')setTimeout(()=>remove(id),5000);
 },[]);
 return <Ctx.Provider value={{notify}}>{children}<div className="toast-stack" aria-live="polite" aria-atomic="false">{items.map(i=><div key={i.id} className={`toast toast-${i.variant}`} role={i.variant==='error'?'alert':'status'}>{i.variant==='success'?<CheckCircle2 size={18}/>:i.variant==='error'?<AlertCircle size={18}/>:<Info size={18}/>}<span>{i.message}</span><button onClick={()=>remove(i.id)} aria-label="Dismiss notification"><X size={16}/></button></div>)}</div></Ctx.Provider>;
}
export const useToast=()=>useContext(Ctx);
