'use client';
import {useEffect,useRef} from 'react';
/** Restore only public discovery positions, keyed by the complete filter URL. */
export function useDiscoveryScroll(ready:boolean,enabled:boolean){
 const restored=useRef(false);
 useEffect(()=>{
  if(!enabled)return;
  const key='haven_scroll:'+location.pathname+location.search;
  const prior=history.scrollRestoration;history.scrollRestoration='manual';
  const save=()=>{try{sessionStorage.setItem(key,String(scrollY));}catch{/* Storage may be unavailable. */}};
  const click=(event:MouseEvent)=>{const target=event.target as Element;if(target.closest('a[href]'))save();};
  const show=(event:PageTransitionEvent)=>{if(event.persisted){const value=Number(sessionStorage.getItem(key));if(Number.isFinite(value))window.scrollTo({top:value,behavior:'instant'});}};
  document.addEventListener('click',click,true);window.addEventListener('pagehide',save);window.addEventListener('pageshow',show);
  return()=>{document.removeEventListener('click',click,true);window.removeEventListener('pagehide',save);window.removeEventListener('pageshow',show);history.scrollRestoration=prior;};
 },[enabled]);
 useEffect(()=>{
  if(!enabled||!ready||restored.current)return;
  restored.current=true;
  if((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type!=='back_forward')return;
  let value:number;try{value=Number(sessionStorage.getItem('haven_scroll:'+location.pathname+location.search));}catch{return;}
  if(!Number.isFinite(value)||value<0)return;
  let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>window.scrollTo({top:value,behavior:'instant'}));});
  return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
 },[ready,enabled]);
}
