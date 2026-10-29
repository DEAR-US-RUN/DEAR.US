import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { sampleDiaries } from './sample';
import type { Diary } from './types';
export function useDiaries(){
 const {preview,user}=useAuth();const [diaries,setDiaries]=useState<Diary[]>(preview?sampleDiaries:[]);const [loading,setLoading]=useState(!preview);const [error,setError]=useState('');
 const reload=useCallback(async()=>{
  if(preview){setDiaries(sampleDiaries);setLoading(false);return;}
  if(!user)return;
  setLoading(true);try{const r=await api<{diaries:Diary[]}>('/diaries');setDiaries(r.diaries);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load your diaries.');}finally{setLoading(false);}
 },[preview,user]);
 useEffect(()=>{void reload();},[reload]);
 return {diaries,loading,error,reload};
}
