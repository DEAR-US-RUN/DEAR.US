import { createContext,useCallback,useContext,useEffect,useLayoutEffect,useState } from 'react';
import type { ReactNode } from 'react';

export type ThemePreference='dark'|'light'|'system';
export type ResolvedTheme='dark'|'light';
const STORAGE_KEY='dear-us:appearance';

export function parseThemePreference(value:string|null):ThemePreference {
 return value==='light'||value==='system'||value==='dark'?value:'dark';
}
export function resolveTheme(preference:ThemePreference,systemDark:boolean):ResolvedTheme {
 return preference==='system'?(systemDark?'dark':'light'):preference;
}
function storedPreference():ThemePreference {
 try{return parseThemePreference(localStorage.getItem(STORAGE_KEY));}catch{return 'dark';}
}
function systemPrefersDark():boolean {
 return typeof window==='undefined'||typeof window.matchMedia!=='function'||window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme(preference:ThemePreference):ResolvedTheme {
 const theme=resolveTheme(preference,systemPrefersDark());
 document.documentElement.dataset.theme=theme;
 document.documentElement.dataset.themePreference=preference;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#101c17':'#f8f9f4');
 return theme;
}
// Run before React renders so a saved choice does not flash the wrong page theme.
export function initializeTheme(){applyTheme(storedPreference());}

type ThemeContextValue={preference:ThemePreference;resolved:ResolvedTheme;setPreference:(value:ThemePreference)=>void};
const ThemeContext=createContext<ThemeContextValue|null>(null);
export function ThemeProvider({children}:{children:ReactNode}) {
 const [preference,setPreferenceState]=useState<ThemePreference>(storedPreference);
 const [resolved,setResolved]=useState<ResolvedTheme>(()=>resolveTheme(preference,systemPrefersDark()));
 const setPreference=useCallback((next:ThemePreference)=>{
  try{localStorage.setItem(STORAGE_KEY,next);}catch{/* Browsing without storage still allows a session choice. */}
  setPreferenceState(next);setResolved(applyTheme(next));
 },[]);
 useLayoutEffect(()=>{setResolved(applyTheme(preference));},[preference]);
 useEffect(()=>{
  if(preference!=='system'||typeof window.matchMedia!=='function')return;
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  const update=()=>setResolved(applyTheme('system'));
  if(typeof media.addEventListener==='function'){media.addEventListener('change',update);update();return()=>media.removeEventListener('change',update);}
  media.addListener(update);update();return()=>media.removeListener(update);
 },[preference]);
 useEffect(()=>{
  const sync=(event:StorageEvent)=>{if(event.key===STORAGE_KEY||event.key===null)setPreferenceState(parseThemePreference(event.newValue));};
  window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[]);
 return <ThemeContext.Provider value={{preference,resolved,setPreference}}>{children}</ThemeContext.Provider>;
}
export function useTheme(){const value=useContext(ThemeContext);if(!value)throw new Error('ThemeProvider is missing');return value;}
