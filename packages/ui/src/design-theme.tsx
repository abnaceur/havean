'use client';
import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
export function DesignTheme(){
 const [dark,setDark]=useState(false);
 useEffect(()=>{
  const apply=()=>{let value=false;try{const saved=localStorage.getItem('haven.theme');value=saved?saved==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;}catch{/* Use the default light theme when storage is unavailable. */}document.documentElement.dataset.theme=value?'dark':'light';setDark(value);};
  const media=window.matchMedia('(prefers-color-scheme: dark)');apply();window.addEventListener('storage',apply);media.addEventListener('change',apply);
  return()=>{window.removeEventListener('storage',apply);media.removeEventListener('change',apply);};
 },[]);
 return <button className="icon-button design-theme" aria-label={dark?'Switch to light theme':'Switch to dark theme'} onClick={()=>{const value=!dark;setDark(value);document.documentElement.dataset.theme=value?'dark':'light';try{localStorage.setItem('haven.theme',value?'dark':'light');}catch{/* Theme remains usable without storage. */}}}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button>;
}
