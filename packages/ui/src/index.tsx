'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {X,LoaderCircle,ArrowRight,House} from 'lucide-react';
export function Brand({href='/bj'}:{href?:string}){return <a href={href} className="brand" aria-label="Haven home"><span className="brand-icon"><House size={21} strokeWidth={2.5}/></span>haven<span className="brand-dot">.</span></a>;}
export function Spinner(){return <div className="loading" role="status"><LoaderCircle className="spin" size={24}/> Loading…</div>;}
export function Empty({title='Nothing here yet',description='Your records will appear here.',children}:{title?:string;description?:string;children?:ReactNode}){return <div className="empty"><House size={32}/><h3>{title}</h3><p>{description}</p>{children}</div>;}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div role="alert" className="error-box">{message}{retry&&<button onClick={retry}>Try again <ArrowRight size={15}/></button>}</div>;}
export function Dialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){const ref=useRef<HTMLDialogElement>(null);const closeRef=useRef(onClose);closeRef.current=onClose;useEffect(()=>{const previous=document.activeElement as HTMLElement;const dialog=ref.current;dialog?.showModal();const priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();closeRef.current();}};dialog?.addEventListener('keydown',key);return()=>{dialog?.removeEventListener('keydown',key);dialog?.close();document.body.style.overflow=priorOverflow;previous?.focus({preventScroll:true});};},[]);return <dialog ref={ref} className="dialog" aria-label={title} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></div>{children}</dialog>;}
export function Badge({children}:{children:ReactNode}){return <span className="badge">{children}</span>;}

export {MediaStudio,MediaReviewQueue} from './media-studio';

export {DraftListingWorkbench} from './draft-workbench';
