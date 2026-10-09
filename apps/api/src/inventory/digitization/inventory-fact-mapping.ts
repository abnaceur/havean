import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationFactCandidate,type DigitizationFactCandidate} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {digitizationListingAccess} from '../property-access.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
type UnitPatch={area?:string;areaBasis?:'document_unit_area';beds?:number;livingRooms?:number;baths?:number};
const countFields={bedrooms:'beds',livingRooms:'livingRooms',bathrooms:'baths'} as const;
/** Inventory accepts explicitly confirmed unit facts only. Legal ownership,
 * document identifiers, land/built-up/net areas and raw text are never mapped
 * into physical-unit identity or publication by inference. */
export function mapConfirmedUnitFacts(candidates:readonly DigitizationFactCandidate[]):UnitPatch{
 const result:UnitPatch={},seen=new Set<string>();
 if(!candidates.length||candidates.length>20)fail(422,'Select the confirmed unit facts to propose.','UNIT_FACT_SELECTION_REQUIRED');
 for(const untrusted of candidates){
  const candidate=digitizationFactCandidate.parse(untrusted);
  if(candidate.origin!=='document'||!['accepted','corrected'].includes(candidate.review.status))fail(422,'Each mapped fact needs an explicit document confirmation.','UNIT_FACT_NOT_CONFIRMED');
  if(seen.has(candidate.field))fail(409,'Resolve competing facts before proposing a unit change.','UNIT_FACT_CONFLICT');seen.add(candidate.field);
  if(candidate.field==='unitArea'){
   const quantity=candidate.normalizedValue;
   if(!quantity||typeof quantity!=='object'||!('amount' in quantity)||quantity.unit!=='m2'||quantity.basis!=='document_unit_area'||!/^\d{1,8}(?:\.\d{1,2})?$/.test(quantity.amount)||BigInt(quantity.amount.replace('.',''))===0n)fail(422,'Confirm unit area in square metres within inventory precision.','UNIT_AREA_MAPPING_REQUIRED');
   result.area=quantity.amount;result.areaBasis='document_unit_area';
  }else if(candidate.field in countFields){
   const value=candidate.normalizedValue;if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>100)fail(422,'Confirm a supported whole-number room count.','UNIT_COUNT_MAPPING_REQUIRED');
   result[countFields[candidate.field as keyof typeof countFields]]=value;
  }else fail(422,'This fact requires a separate explicit inventory mapping.','UNIT_FACT_MAPPING_UNSUPPORTED');
 }
 return result;
}
/** Read-only preparation for the reviewed application port. No public unit,
 * listing, money, geography, asset or approval is changed here. */
export async function prepareConfirmedUnitChange(c:pg.PoolClient,a:Actor,engine:string,x:{workspaceVersion:number;inputRevision:number;listingVersion:number;decisionIds:string[]}){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,engine);
 if(workspace.target.type!=='listing')fail(422,'Attach the intake through reviewed inventory mapping first.','UNIT_TARGET_REQUIRED');
 const listing=await digitizationListingAccess(c,a,workspace.target.id);
 if(workspace.version!==x.workspaceVersion||workspace.inputRevision!==x.inputRevision||listing.version!==x.listingVersion)fail(409,'Workspace, source inputs or listing changed.','VERSION_CONFLICT');
 if(listing.status!=='published')fail(409,'Use the draft application workflow for this listing.','WORKFLOW_CONFLICT');
 if(!x.decisionIds.length||x.decisionIds.length>20||new Set(x.decisionIds).size!==x.decisionIds.length)fail(422,'Select distinct current fact decisions.','UNIT_FACT_SELECTION_REQUIRED');
 const rows=(await c.query(`SELECT d.id AS decision_id,d.candidate_version,d.decision,d.value,d.created_by AS reviewer,d.created_at AS reviewed_at,f.id,f.version,f.field,f.candidate,f.input_revision,
 (SELECT latest.id FROM fact_decisions latest WHERE latest.digitization_id=f.digitization_id AND latest.candidate_id=f.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AS latest_decision,
 (SELECT count(*)::int FROM fact_decisions latest WHERE latest.digitization_id=f.digitization_id AND latest.candidate_id=f.id AND latest.created_at=(SELECT max(last_decision.created_at) FROM fact_decisions last_decision WHERE last_decision.digitization_id=f.digitization_id AND last_decision.candidate_id=f.id)) AS latest_count
 FROM fact_decisions d JOIN fact_candidates f ON f.id=d.candidate_id AND f.digitization_id=d.digitization_id WHERE d.id=ANY($1::uuid[]) AND d.digitization_id=$2`,[x.decisionIds,engine])).rows;
 if(rows.length!==x.decisionIds.length)fail(404,'Current private fact selection not found');
 const snapshot=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,x.inputRevision])).rows[0];
 if(!snapshot||(await c.query("SELECT digitization_revision_access($1,$2,'document_processing') allowed",[engine,x.inputRevision])).rows[0].allowed!==true)fail(403,'Current source processing authority is required.','UNIT_SOURCE_SCOPE_REQUIRED');
 const sources=new Set(snapshot.source_set.filter((s:any)=>s.purpose==='document').map((s:any)=>s.assetId));
 const candidates=rows.map(row=>{
  if(row.latest_count!==1||row.latest_decision!==row.decision_id||row.candidate_version!==row.version||row.input_revision!==x.inputRevision||!['accepted','corrected'].includes(row.decision))fail(409,'A selected fact confirmation changed or is ambiguous.','UNIT_FACT_CONFIRMATION_CHANGED');
  const candidate=digitizationFactCandidate.parse({...row.candidate,...(row.decision==='corrected'?{normalizedValue:row.value}:{}),review:{status:row.decision,actorId:row.reviewer,reviewedAt:row.reviewed_at.toISOString()}});
  if(candidate.id!==row.id||candidate.version!==row.version||candidate.field!==row.field||candidate.inputRevision!==x.inputRevision||candidate.organizationId!==workspace.organizationId||candidate.target.type!=='listing'||candidate.target.id!==listing.id||candidate.target.unitId!==listing.unit_id||candidate.evidence.some(e=>!sources.has(e.assetId)))fail(422,'Every mapped fact must retain its exact unit/document lineage.','UNIT_FACT_LINEAGE_INVALID');
  return candidate;
 });
 const unit=(await c.query('SELECT id,community_id,area::text,beds,living_rooms,baths,orientation,floor,elevator FROM units WHERE id=$1',[listing.unit_id])).rows[0];if(!unit)fail(404,'Physical unit not found');
 return {listingId:listing.id,unitId:unit.id,listingVersion:listing.version,inputRevision:x.inputRevision,decisionIds:x.decisionIds,unitBefore:unit,unitFingerprint:createHash('sha256').update(JSON.stringify(unit)).digest('hex'),unitPatch:mapConfirmedUnitFacts(candidates)};
}
