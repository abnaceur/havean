import {conflictingFactFields} from './fact-conflicts.js';
import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationFactCandidate,digitizationFactReview,type DigitizationFactDecision} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';

export async function readFactReview(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 const rows=(await c.query('SELECT id,version,candidate FROM fact_candidates WHERE digitization_id=$1 AND input_revision=$2 ORDER BY created_at,id LIMIT 1001',[engine,workspace.inputRevision])).rows;
 const decisions=(await c.query(`SELECT d.id,d.candidate_id AS "candidateId",d.candidate_version AS "candidateVersion",d.decision,d.value,d.note,d.created_by AS "actorId",d.created_at AS "createdAt" FROM fact_decisions d JOIN fact_candidates f ON f.id=d.candidate_id AND f.digitization_id=d.digitization_id WHERE d.digitization_id=$1 AND f.input_revision=$2 ORDER BY d.created_at,d.id LIMIT 5001`,[engine,workspace.inputRevision])).rows.map(row=>({...row,createdAt:row.createdAt.toISOString()}));
 const pages=(await c.query(`SELECT DISTINCT ON(b.asset_id,p.page) b.asset_id AS "assetId",p.page,p.preview_artifact_id AS "artifactId",(ar.quality_report->>'width')::int AS width,(ar.quality_report->>'height')::int AS height FROM document_pages p JOIN digitization_asset_bindings b ON b.id=p.binding_id AND b.digitization_id=p.digitization_id JOIN artifacts ar ON ar.id=p.preview_artifact_id AND ar.digitization_id=p.digitization_id WHERE p.digitization_id=$1 AND p.input_revision=$2 AND ar.status='private' ORDER BY b.asset_id,p.page,(ar.quality_report->>'kind'='document_ocr_page') DESC NULLS LAST,ar.created_at DESC,ar.id DESC LIMIT 5001`,[engine,workspace.inputRevision])).rows;
 if(rows.length>1000||decisions.length>5000||pages.length>5000)fail(422,'The fact review exceeds its bounded review budget.','FACT_REVIEW_BUDGET');
 const candidates=rows.map(row=>{
  const candidate=digitizationFactCandidate.parse(row.candidate);
  if(candidate.id!==row.id||candidate.version!==row.version||candidate.inputRevision!==workspace.inputRevision)fail(422,'Fact identity does not match its stored source.','FACT_INVALID');
  for(const evidence of candidate.evidence)if(!pages.some(page=>page.assetId===evidence.assetId&&page.page===evidence.page))fail(409,'A fact source page is unavailable.','FACT_SOURCE_UNAVAILABLE');
  const latest=decisions.filter(d=>d.candidateId===row.id&&d.candidateVersion===row.version).at(-1);
  return latest?digitizationFactCandidate.parse({...candidate,normalizedValue:latest.decision==='accepted'&&latest.value===null?candidate.normalizedValue:latest.value,review:{status:latest.decision,actorId:latest.actorId,reviewedAt:latest.createdAt}}):candidate;
 }).sort((left,right)=>left.evidence[0].page-right.evidence[0].page||left.field.localeCompare(right.field)||left.id.localeCompare(right.id));
 const conflictingFields=conflictingFactFields(candidates);
 return digitizationFactReview.parse({workspaceVersion:workspace.version,inputRevision:workspace.inputRevision,candidates,history:decisions,pages,conflictingFields:[...new Set(conflictingFields)],reviewRequired:true});
}
/** Append a decision; extractor records are immutable and inventory is untouched. */
export async function decideFact(c:pg.PoolClient,a:Actor,engine:string,candidateId:string,x:DigitizationFactDecision){
 const review=await readFactReview(c,a,engine),workspace=await checkedWorkspace(c,engine);
 if(workspace.state!=='active')fail(409,'This workspace no longer accepts fact decisions.','WORKFLOW_CONFLICT');
 if(review.workspaceVersion!==x.version||review.inputRevision!==x.inputRevision)fail(409,'The facts or their source revision changed. Reload before reviewing.','VERSION_CONFLICT');
 const candidate=review.candidates.find(item=>item.id===candidateId);
 if(!candidate)fail(404,'Current fact candidate not found.');
 if(candidate.version!==x.candidateVersion)fail(409,'The candidate changed.','VERSION_CONFLICT');
 if(x.decision==='accepted'&&JSON.stringify(x.value)!==JSON.stringify(candidate.normalizedValue))fail(422,'Accept the displayed value or record a correction.','FACT_DECISION_INVALID');
 if(['rejected','unknown','conflict'].includes(x.decision)&&x.value!==null)fail(422,'This decision must leave the value unknown.','FACT_DECISION_INVALID');
 if(['accepted','corrected'].includes(x.decision)&&x.value===null)fail(422,'A confirmation needs an explicit value.','FACT_DECISION_INVALID');
 try{digitizationFactCandidate.parse({...candidate,normalizedValue:x.value});}catch{fail(422,'The value does not match this fact field.','FACT_DECISION_INVALID');}
 await c.query(`INSERT INTO fact_decisions(digitization_id,organization_id,created_by,candidate_id,candidate_version,decision,value,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())`,[engine,a.orgId,a.id,candidateId,x.candidateVersion,x.decision,JSON.stringify(x.value),x.note]);
 await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[engine]);
 await event(c,a,engine,'digitization.fact_decided',{candidateId,inputRevision:x.inputRevision,decision:x.decision});
 return readFactReview(c,a,engine);
}
