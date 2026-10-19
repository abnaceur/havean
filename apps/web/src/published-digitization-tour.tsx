'use client';
import {useState,useEffect,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {sdk} from '@haven/contracts';
import {Dialog,ErrorBox} from '@haven/ui';
import dynamic from 'next/dynamic';
const Panorama=dynamic(()=>import('./panorama').then(m=>m.Panorama),{ssr:false});
export function PublishedDigitizationTour({listingId,open:controlledOpen,onOpen,onClose,navigation}:{listingId:string;open?:boolean;onOpen?:()=>void;onClose?:()=>void;navigation?:ReactNode}){
 const [localOpen,setOpen]=useState(false),[selected,setSelected]=useState<string|null>(null);
 const open=controlledOpen??localOpen;
 const query=useQuery({queryKey:['approved-digitization-tour',listingId],queryFn:()=>sdk.DigitizationPublicationController_manifest({params:{listingId}}),staleTime:0,refetchOnWindowFocus:true});
 useEffect(()=>{if(open){setSelected(null);void query.refetch();}},[open,query.refetch]);
 const tour=query.data?.data;if(!tour)return null;
 const node=tour.nodes.find(n=>n.slot===selected)||tour.nodes.find(n=>n.slot===tour.entryNode)||tour.nodes[0];
 return <section aria-label="Reviewed property captures"><button className="button secondary" onClick={()=>{if(onOpen)onOpen();else setOpen(true);setSelected(null);void query.refetch();}}>Explore reviewed 360° captures</button>{open&&<Dialog className="reviewed-media-dialog" title="Reviewed property captures" onClose={onClose??(()=>setOpen(false))}>{navigation}{query.isError?<ErrorBox message="The approved tour is unavailable. Close this viewer to use the property gallery." retry={()=>void query.refetch()}/>:<><p>These are reviewed panorama captures. Metric measurements are unavailable.</p><Panorama key={tour.packageId+node.slot} scene={{title:node.label,url:node.tiers[0].url,hotspots:node.hotspots.map(h=>({...h,targetId:h.targetNode}))}} onScene={setSelected}/><div className="media-scenes" role="group" aria-label="Reviewed tour scenes">{tour.nodes.map(n=><button key={n.slot} aria-pressed={n.slot===node.slot} onClick={()=>setSelected(n.slot)}>{n.label}</button>)}</div>{tour.limitations.map(text=><p key={text} className="fine-print">{text}</p>)}</>}</Dialog>}</section>;
}
