'use client';
import {useState,useEffect,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {sdk} from '@haven/contracts';
import {Dialog,ErrorBox,SplatViewer,StructuralPlanViewer} from '@haven/ui';
export function PublishedDigitizationModel({listingId,open:controlledOpen,onOpen,onClose,navigation}:{listingId:string;open?:boolean;onOpen?:()=>void;onClose?:()=>void;navigation?:ReactNode}){
 const [localOpen,setOpen]=useState(false),[lost,setLost]=useState(false);
 const open=controlledOpen??localOpen;
 const query=useQuery({queryKey:['approved-digitization-model',listingId],queryFn:()=>sdk.DigitizationModelPublicationController_manifest({params:{listingId}}),staleTime:0,refetchOnWindowFocus:true});
 useEffect(()=>{if(open){setLost(false);void query.refetch();}},[open,query.refetch]);
 const model=query.data?.data;if(!model)return null;
 const scopeLost=()=>{setLost(true);void query.refetch();};
 return <section aria-label="Reviewed property model"><button className="button secondary" onClick={()=>{if(onOpen)onOpen();else setOpen(true);setLost(false);void query.refetch();}}>Explore reviewed {model.viewerType==='structural'?'structural model':'reconstructed scene'}</button>{open&&<Dialog className="property-model-dialog reviewed-media-dialog" title="Reviewed property model" onClose={onClose??(()=>setOpen(false))}>{navigation}{query.isError||lost?<ErrorBox message="The approved model is unavailable. Close this viewer to use the property gallery." retry={()=>{setLost(false);void query.refetch();}}/>:<>{model.viewerType!=='structural'&&<p>Unscaled reconstructed visualization. Surfaces and rooms may be incomplete. Metric measurements are unavailable.</p>}{model.viewerType==='structural'?<StructuralPlanViewer autoOpen key={model.packageId} url={model.contentUrl} candidateChecksum={model.candidateChecksum} onScopeLost={scopeLost}/>:<SplatViewer key={model.packageId} url={model.contentUrl} publication onScopeLost={scopeLost}/>} {model.limitations.map(text=><p key={text} className="fine-print">{text}</p>)}</>}</Dialog>}</section>;
}
