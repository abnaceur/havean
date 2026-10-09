import {draftUnit,type DigitizationFactCandidate} from '@haven/contracts';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {mapConfirmedUnitFacts,prepareConfirmedUnitChange} from './inventory-fact-mapping.js';

const fields=['communityId','area','beds','livingRooms','baths','orientation','floor','privateAddress'] as const;
type Field=typeof fields[number];
type FormValues=Record<Field,string|number|null>;
/** Missing document data stays empty. Manual entries never acquire fabricated
 * document evidence; canonical submission still uses the inventory validator. */
export function prepareUnitForm(candidates:readonly DigitizationFactCandidate[],manual:Partial<FormValues>={}){
 const confirmed=candidates.filter(candidate=>candidate.origin==='document'&&['accepted','corrected'].includes(candidate.review.status)&&['unitArea','bedrooms','livingRooms','bathrooms'].includes(candidate.field));
 return formFromPatch(confirmed.length?mapConfirmedUnitFacts(confirmed):{},manual);
}
function formFromPatch(patch:ReturnType<typeof mapConfirmedUnitFacts>,manual:Partial<FormValues>){
 const values:FormValues={communityId:null,area:null,beds:null,livingRooms:null,baths:null,orientation:null,floor:null,privateAddress:null};
 const provenance:Partial<Record<Field,'confirmed_document'|'user'>>={};
 for(const field of fields)if(field in patch){values[field]=patch[field as keyof typeof patch]??null;provenance[field]='confirmed_document';}
 for(const field of fields){
  if(Object.hasOwn(manual,field)){
   const value=manual[field];values[field]=value===undefined||value===null||typeof value==='string'&&!value.trim()?null:value;
   if(values[field]===null)delete provenance[field];else provenance[field]='user';
  }
 }
 const missing=fields.filter(field=>values[field]===null);
 const validation=draftUnit.safeParse(values);
 return {values,provenance,missing,invalid:validation.success?[]:[...new Set(validation.error.issues.map(issue=>String(issue.path[0])).filter(field=>!missing.includes(field as Field)))],ready:validation.success};
}
/** Application preparation consumes only current scoped persisted decisions,
 * never client-supplied candidates or pre-existing unit values as defaults. */
export async function prepareConfirmedUnitForm(c:pg.PoolClient,a:Actor,engine:string,input:Parameters<typeof prepareConfirmedUnitChange>[3],manual:Partial<FormValues>={}){
 const selection=await prepareConfirmedUnitChange(c,a,engine,input);
 return {...selection,form:formFromPatch(selection.unitPatch,manual)};
}
