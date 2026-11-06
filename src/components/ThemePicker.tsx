import type { CSSProperties } from 'react';
import { Monitor,MoonStar,Sun } from 'lucide-react';
import { useTheme } from '../theme';
import { runViewTransition } from '../motion';
const choices=[
 {value:'dark' as const,label:'Dark',detail:'Soft on the eyes',Icon:MoonStar},
 {value:'light' as const,label:'Light',detail:'Bright and airy',Icon:Sun},
 {value:'system' as const,label:'System',detail:'Follows your device',Icon:Monitor},
];
export function ThemePicker({variant='compact'}:{variant?:'compact'|'cards'}){
 const {preference,setPreference}=useTheme();
 const activeIdx=Math.max(0,choices.findIndex(c=>c.value===preference));
 return <div
  className={`theme-picker theme-picker-${variant}`}
  style={variant==='compact'?({'--active-idx':activeIdx} as CSSProperties):undefined}
  role="group"
  aria-label={variant==='compact'?'Quick appearance controls':'Appearance options'}
 >
  {variant==='compact'&&<span className="theme-pill-thumb" aria-hidden="true"/>}
  {choices.map(({value,label,detail,Icon})=><button
   key={value}
   type="button"
   className="theme-option"
   aria-label={`${label} theme`}
   aria-pressed={preference===value}
   title={`${label} theme`}
   onClick={()=>{if(preference!==value)runViewTransition(()=>setPreference(value),{kind:'theme'});}}
  >
   <Icon size={variant==='compact'?15:18} strokeWidth={1.7}/>{variant==='cards'&&<span><strong>{label}</strong><small>{detail}</small></span>}
  </button>)}
 </div>;
}
