'use client';
import {useState,useRef} from 'react';
import {sdk,type DigitizationGeometryRevision} from '@haven/contracts';
type Draft=NonNullable<Awaited<ReturnType<typeof sdk.DigitizationArtifactController_geometry>>['data']>;
export function ConstructionEdit({workspaceId,draft,onSaved}:{workspaceId:string;draft:Draft;onSaved:(draft:Draft)=>void}){
 const g:DigitizationGeometryRevision=draft.geometry;
 const [kind,setKind]=useState<'wall'|'room'|'opening'>('wall'),[selected,setSelected]=useState(''),[fields,setFields]=useState<Record<string,string>>({}),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const receipt=useRef<{body:string;key:string}|null>(null);
 const options=kind==='wall'?g.walls.map(w=>({id:w.id,label:w.id})):kind==='room'?g.rooms.map(r=>({id:r.id,label:r.name})):g.openings.map(o=>({id:o.id,label:o.type+' · '+o.id}));
 function select(id:string){setSelected(id);setError('');if(kind==='wall'){const w=g.walls.find(v=>v.id===id);setFields(w?{startX:String(w.start.x),startY:String(w.start.y),endX:String(w.end.x),endY:String(w.end.y),thickness:w.thickness}:{});}else if(kind==='room'){const r=g.rooms.find(v=>v.id===id);setFields(r?{name:r.name,polygon:r.polygon.map(p=>p.x+', '+p.y).join('\n')}:{});}else{const o=g.openings.find(v=>v.id===id);setFields(o?{offset:o.offset,width:o.width,sill:o.sill??'',height:o.height??''}:{});}}
 const labels:Record<string,string>={startX:'Wall start X (metres)',startY:'Wall start Y (metres)',endX:'Wall end X (metres)',endY:'Wall end Y (metres)',thickness:'Wall thickness (metres)',name:'Room name',polygon:'Room boundary (X, Y metres; one point per line)',offset:'Opening offset (metres)',width:'Opening width (metres)',sill:'Opening sill (metres)',height:'Opening height (metres)'};
 return <form aria-label="Edit scaled construction" onSubmit={async e=>{e.preventDefault();if(busy||!selected)return;setBusy(true);setError('');try{
  const operation=kind==='wall'?{kind,wallId:selected,start:{x:Number(fields.startX),y:Number(fields.startY)},end:{x:Number(fields.endX),y:Number(fields.endY)},thickness:fields.thickness}:kind==='room'?{kind,roomId:selected,name:fields.name,polygon:fields.polygon.trim().split('\n').map(line=>{const values=line.split(',');if(values.length!==2||values.some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error('Each boundary line must contain two numeric coordinates.');return {x:Number(values[0]),y:Number(values[1])};})}:{kind,openingId:selected,offset:fields.offset,width:fields.width,sill:fields.sill||null,height:fields.height||null};
  const body={version:draft.workspaceVersion,geometryRevisionId:g.id,note,suppliedLayoutConfirmed:confirmed as true,operation},serialized=JSON.stringify(body);if(receipt.current?.body!==serialized)receipt.current={body:serialized,key:crypto.randomUUID()};
  const result=await sdk.DigitizationArtifactController_constructionEdit({params:{id:workspaceId},body,headers:{'Idempotency-Key':receipt.current.key}});if(!result.data)throw Error('Source access changed. Reload this workspace.');onSaved(result.data);
 }catch(e){setError(e instanceof Error?e.message:'Construction edit was not saved.');}finally{setBusy(false);}}}>
 <fieldset disabled={busy}><legend>Correct the scaled plan</legend><p>Changes create a new private revision. Existing scale references stay fixed. Openings must fit their walls, and furniture must remain inside its room.</p>
 <label>Construction element<select aria-label="Construction element" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setSelected('');setFields({});}}><option value="wall">Wall</option><option value="room">Room boundary</option><option value="opening">Door or window opening</option></select></label>
 <label>Element to edit<select aria-label="Element to edit" value={selected} onChange={e=>select(e.target.value)}><option value="">Choose an element</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
 {Object.entries(fields).map(([key,value])=><label key={key}>{labels[key]}{key==='polygon'?<textarea required rows={6} value={value} onChange={e=>setFields({...fields,[key]:e.target.value})}/>:<input required={!['sill','height'].includes(key)} inputMode={key==='name'?'text':'decimal'} value={value} onChange={e=>setFields({...fields,[key]:e.target.value})}/>}</label>)}
 <label>Construction source note<textarea required minLength={5} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <label><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked these changes against the property source; they remain unverified.</label>
 <button className="button" disabled={!selected||!confirmed||note.trim().length<5}>{busy?'Saving revision…':'Save construction revision'}</button>{error&&<p role="alert">{error}</p>}
 </fieldset></form>;
}
