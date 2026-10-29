import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({title,subtitle,onClose,children,wide=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const root=ref.current;const first=root?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])');first?.focus();
  function onKey(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'&&root){const all=[...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];if(!all.length)return;const index=all.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&index<=0){e.preventDefault();all[all.length-1].focus();}else if(!e.shiftKey&&index===all.length-1){e.preventDefault();all[0].focus();}}}
  document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('keydown',onKey);previous?.focus();};
 },[onClose]);
 return createPortal(<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" data-close onClick={onClose} aria-label="Close"><X size={19}/></button><div className="modal-header"><span className="eyebrow">DEAR, US.</span><h2 id="modal-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{children}</div></div>,document.body);
}
