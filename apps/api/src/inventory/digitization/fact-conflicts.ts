import type pg from 'pg';
import {digitizationFactCandidate,type DigitizationFactCandidate} from '@haven/contracts';
import {fail} from '../../platform/core.js';

export function factValueKey(value:DigitizationFactCandidate['normalizedValue']):string{
 if(value&&typeof value==='object'&&'amount' in value){
  const [whole,fraction='']=value.amount.split('.');
  return JSON.stringify({amount:BigInt(whole).toString()+(fraction.replace(/0+$/,'')?'.'+fraction.replace(/0+$/,''):''),unit:value.unit,basis:value.basis});
 }
 return JSON.stringify(value);
}
export function conflictingFactFields(candidates:readonly DigitizationFactCandidate[]){
 const fields=new Map<DigitizationFactCandidate['field'],Set<string>>(),explicit=new Set<DigitizationFactCandidate['field']>();
 for(const fact of candidates){
  if(['rejected','unknown'].includes(fact.review.status))continue;
  if(fact.review.status==='conflict')explicit.add(fact.field);
  if(fact.normalizedValue===null)continue;
  const values=fields.get(fact.field)??new Set<string>();values.add(factValueKey(fact.normalizedValue));fields.set(fact.field,values);
 }
 for(const [field,values] of fields)if(values.size>1)explicit.add(field);
 return [...explicit].sort();
}
/** Selection cannot hide a contradictory current document. This is a read-only
 * guard under the caller's workspace lock; original candidates stay immutable. */
export async function assertNoSelectedFactConflicts(c:pg.PoolClient,engine:string,inputRevision:number,selected:readonly DigitizationFactCandidate[]){
 const rows=(await c.query(`SELECT f.candidate,d.decision,d.value,d.created_by,d.created_at FROM fact_candidates f LEFT JOIN LATERAL (SELECT decision,value,created_by,created_at FROM fact_decisions WHERE candidate_id=f.id AND digitization_id=f.digitization_id AND candidate_version=f.version ORDER BY created_at DESC,id DESC LIMIT 1) d ON true WHERE f.digitization_id=$1 AND f.input_revision=$2 AND f.field=ANY($3::text[]) ORDER BY f.id LIMIT 1001`,[engine,inputRevision,selected.map(f=>f.field)])).rows;
 if(rows.length>1000)fail(422,'Resolve the bounded source fact review before applying it.','FACT_REVIEW_BUDGET');
 const facts=rows.map(row=>digitizationFactCandidate.parse({...row.candidate,...(row.decision?{normalizedValue:row.decision==='accepted'&&row.value===null?row.candidate.normalizedValue:row.value,review:{status:row.decision,actorId:row.created_by,reviewedAt:row.created_at.toISOString()}}:{})}));
 if(conflictingFactFields(facts).length)fail(409,'Resolve all competing current source facts before applying this selection.','UNIT_FACT_CONFLICT');
}
