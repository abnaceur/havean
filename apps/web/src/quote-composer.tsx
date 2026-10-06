'use client';
import {useRef,useState} from 'react';
import {api,quoteCreate} from '@haven/contracts';
import {ErrorBox} from '@haven/ui';
export function QuoteComposer({provider,currency}:{provider:{id:string;version:number;city:string;name:string;categories:string[];districtIds:string[];districts:string[]};currency:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState(''),pending=useRef<{body:string;key:string}|null>(null);
 if(receipt)return <div role="status"><h3>Quote request saved</h3><p>Your nonbinding request was routed to {provider.name}. No contract or payment has been created.</p><a className="button" href={'/account/quotes?quote='+receipt}>View request and timeline</a></div>;
 return <form onSubmit={async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)),parsed=quoteCreate.safeParse({...v,version:0,providerId:provider.id,providerVersion:provider.version,city:provider.city,currency,budget:v.budget||null,consent:v.consent==='on',policyVersion:1});if(!parsed.success){setError(parsed.error.issues.map(i=>i.message).join(' · '));return;}const body=JSON.stringify(parsed.data);if(pending.current?.body!==body)pending.current={body,key:crypto.randomUUID()};setBusy(true);setError('');try{const r=await api<{id:string}>('/quote-requests',{method:'POST',headers:{'idempotency-key':pending.current.key},body});setReceipt(r.data.id);}catch(e){setError(e instanceof Error?e.message:'Request failed. Your details are retained.');}finally{setBusy(false);}}}>
 <label className="field"><span>Service needed</span><select aria-label="Service needed" name="serviceCategory" required>{provider.categories.map(c=><option key={c}>{c}</option>)}</select></label>
 <label className="field"><span>Project area</span><select aria-label="Project area" name="districtId" required>{provider.districtIds.map((id,i)=><option key={id} value={id}>{provider.districts[i]||'Service area'}</option>)}</select></label>
 <label className="field"><span>Project description</span><textarea name="description" required minLength={20} maxLength={3000}/></label>
 <label className="field"><span>Estimated budget ({currency}) — optional</span><input name="budget" type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?"/></label>
 <label className="field"><span>Your name</span><input name="contactName" autoComplete="name" required minLength={2} maxLength={80}/></label>
 <label className="field"><span>Email address</span><input name="contactEmail" type="email" autoComplete="email" required/></label>
 <label className="field"><span>Phone number</span><input name="contactPhone" type="tel" autoComplete="tel" required/></label>
 <label><input name="consent" type="checkbox" required/> I agree to share these project and contact details with the selected provider for this request.</label>
 <p className="fine-print">A quote request does not create a contract or transfer any funds. Budget and later quote discussions are nonbinding.</p>{error&&<ErrorBox message={error}/>}<button className="button" disabled={busy}>{busy?'Saving request…':'Request a quote'}</button></form>;
}
