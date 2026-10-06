'use client';
import {useRef,useState} from 'react';
import {api,inquirySchema,type inquirySessionRecord} from '@haven/contracts';
import type {z} from 'zod';
import {ErrorBox} from '@haven/ui';
type Context=Pick<z.infer<typeof inquirySchema>,'resourceId'|'resourceType'|'resourceVersion'|'city'|'floorPlanId'|'floorPlanVersion'> & {intent?:'general'|'available_unit'};
export function InquiryComposer({context,signedIn,accountId,submitLabel='Send inquiry',onSuccess}:{context:Context;signedIn:boolean;accountId?:string;submitLabel?:string;onSuccess:(message:string)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<string|null>(null);
 const pending=useRef<{fingerprint:string;key:string}|null>(null),guest=useRef<z.infer<typeof inquirySessionRecord>|null>(null);
 return receipt?<section className="success-panel" role="status"><h3>Your inquiry is saved.</h3><p>The assigned team can follow up using the contact details you provided.</p><p>Reference: <strong>{receipt}</strong></p></section>:<form className="field-form" onSubmit={async e=>{e.preventDefault();if(busy)return;const fields=new FormData(e.currentTarget);setBusy(true);setError('');try{
  const validation=inquirySchema.safeParse({...context,name:String(fields.get('name')),email:String(fields.get('email')),phone:String(fields.get('phone')),message:String(fields.get('message')),consent:fields.get('consent')==='on',consentPolicyVersion:1});if(!validation.success)throw new Error(validation.error.issues.map(issue=>issue.message).join(' '));const body=validation.data;
  if(!signedIn&&!guest.current)guest.current=(await api<z.infer<typeof inquirySessionRecord>>('/inquiry-session',{method:'POST',body:JSON.stringify({version:0})})).data;
  const input=signedIn?body:{...body,sessionVersion:guest.current!.version,website:''};
  const bytes=new TextEncoder().encode(JSON.stringify({actor:signedIn?accountId??'account':guest.current!.id,input}));
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const storageKey='haven-inquiry-retry:'+fingerprint;
  if(pending.current?.fingerprint!==fingerprint){let key:string|null=null;try{key=sessionStorage.getItem(storageKey);}catch{/* The in-memory key remains available if browser storage is disabled. */}pending.current={fingerprint,key:key&&/^[a-f0-9-]{36}$/.test(key)?key:crypto.randomUUID()};try{sessionStorage.setItem(storageKey,pending.current.key);}catch{/* The in-memory key remains available if browser storage is disabled. */}}
  const result=await api<{id:string}>(signedIn?'/inquiries':'/guest-inquiries',{method:'POST',headers:{'idempotency-key':pending.current.key},body:JSON.stringify(input)});
  try{sessionStorage.removeItem(storageKey);}catch{/* The in-memory key remains available if browser storage is disabled. */}pending.current=null;
  if(signedIn)onSuccess('Inquiry saved. Your property team can follow up. Reference: '+result.data.id);else setReceipt(result.data.id);
 }catch(e){setError(e instanceof Error?e.message:'Your inquiry could not be saved. Try again.');}finally{setBusy(false);}}}>
 {([['name','Your name','text'],['email','Email address','email'],['phone','Phone number','tel']] as const).map(([name,label,type])=><label className="field" key={name}><span>{label}</span><input name={name} type={type} required minLength={name==='name'?2:undefined} maxLength={name==='name'?80:254} disabled={busy}/></label>)}
 <label className="field"><span>How can we help?</span><textarea name="message" required minLength={5} maxLength={2000} disabled={busy}/></label>
 <label className="checkbox-field"><input name="consent" type="checkbox" required disabled={busy}/>I agree to share these details with the assigned team.</label>
 {error&&<ErrorBox message={error}/>}<button className="button" disabled={busy} type="submit">{busy?'Sending…':submitLabel}</button>
 </form>;
}
