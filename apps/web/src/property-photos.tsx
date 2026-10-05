'use client';
import {useState,useRef,useCallback,type KeyboardEvent,type TouchEvent} from 'react';
import {ChevronLeft,ChevronRight,House} from 'lucide-react';
import {Dialog} from '@haven/ui';
function PropertyPhoto({src,title}:{src?:string;title:string}){const [failed,setFailed]=useState(false);return src&&!failed?<img src={src} alt={title||'Property photograph'} loading="lazy" onError={()=>setFailed(true)}/>:<div className="photo-fallback"><House size={32}/><span>Photo unavailable</span></div>;}
export function PropertyPhotoGallery({photos,title}:{photos:string[];title:string}){
 const [index,setIndex]=useState(0),[open,setOpen]=useState(false),start=useRef<number|null>(null),close=useCallback(()=>setOpen(false),[]),count=photos.length;
 function move(delta:number){if(count>1)setIndex(value=>(value+delta+count)%count);}
 function key(event:KeyboardEvent){if(['INPUT','SELECT','TEXTAREA'].includes((event.target as HTMLElement).tagName))return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}}
 function touch(event:TouchEvent){if(start.current===null)return;const delta=event.changedTouches[0].clientX-start.current;start.current=null;if(Math.abs(delta)>30)move(delta<0?1:-1);}
 const controls=<>{count>1&&<><button type="button" className="gallery-arrow previous" aria-label="Previous photo" onClick={()=>move(-1)}><ChevronLeft/></button><button type="button" className="gallery-arrow next" aria-label="Next photo" onClick={()=>move(1)}><ChevronRight/></button></>}<span className="gallery-count" aria-live="polite">{count?index+1:0} / {count} photos</span></>;
 const picture=<PropertyPhoto key={photos[index]||'unavailable'} src={photos[index]} title={title}/>;
 return <><div className="detail-gallery" onKeyDown={key} onTouchStart={event=>{start.current=event.touches[0].clientX;}} onTouchEnd={touch}>{count?<button type="button" className="gallery-main" onClick={()=>setOpen(true)} aria-label="Open property gallery">{picture}</button>:picture}{controls}</div>{open&&<Dialog title="Property gallery" onClose={close} onKeyDown={key}><div className="lightbox" onTouchStart={event=>{start.current=event.touches[0].clientX;}} onTouchEnd={touch}>{picture}{controls}</div></Dialog>}</>;
}
