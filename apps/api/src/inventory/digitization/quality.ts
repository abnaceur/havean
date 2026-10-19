import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationQualitySummary,digitizationAreaComparison,ringArea,type DigitizationAreaSummary} from '@haven/contracts';
import {checkedWorkspace} from './intakes.js';
import {readFactReview} from './fact-review.js';
import {readGeometryDraft} from './geometry-drafts.js';
import {countUnresolvedOcrPages} from './ocr-quality.js';
import {fail} from '../../platform/core.js';
import {latestCameraReview} from './camera-results.js';

/** Compare like units and area bases only. Exact decimal subtraction never
 * turns a room-net drawing into documentary built-up/land/unit area. */
export function compareAreaQuantities(left:DigitizationAreaSummary,right:DigitizationAreaSummary){
 const base={leftId:left.id,rightId:right.id,officialEquivalenceConfirmed:false as const};
 if(left.quantity.basis==='unknown'||right.quantity.basis==='unknown')return digitizationAreaComparison.parse({...base,status:'incomparable',reason:'unknown_basis',absoluteDifference:null});
 if(left.quantity.basis!==right.quantity.basis)return digitizationAreaComparison.parse({...base,status:'incomparable',reason:'different_basis',absoluteDifference:null});
 if(left.quantity.unit!==right.quantity.unit)return digitizationAreaComparison.parse({...base,status:'incomparable',reason:'different_unit',absoluteDifference:null});
 const integer=(amount:string)=>{const [whole,fraction='']=amount.split('.');return BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));};
 const difference=integer(left.quantity.amount)-integer(right.quantity.amount),absolute=difference<0n?-difference:difference;
 const decimal=(absolute/100000000n).toString()+'.'+(absolute%100000000n).toString().padStart(8,'0');
 return digitizationAreaComparison.parse({...base,status:absolute===0n?'same_quantity':'different_quantity',reason:'same_unit_and_basis',absoluteDifference:decimal.replace(/\.?0+$/,'')||'0'});
}
export async function readPrivateQualitySummary(c:pg.PoolClient,a:Actor,engine:string){
 const facts=await readFactReview(c,a,engine),workspace=await checkedWorkspace(c,engine);let geometry:Awaited<ReturnType<typeof readGeometryDraft>>=null;
 try{geometry=await readGeometryDraft(c,a,engine);}catch(error:any){if(error.code!=='INPUT_REVISION_CONFLICT'&&error.getResponse?.()?.code!=='INPUT_REVISION_CONFLICT')throw error;}
 const areas:DigitizationAreaSummary[]=facts.candidates.flatMap(candidate=>{const value=candidate.normalizedValue;return value&&typeof value==='object'&&'amount' in value&&['m2','ft2','ha'].includes(value.unit)?[{id:candidate.id,origin:'document' as const,field:candidate.field,quantity:{amount:value.amount,unit:value.unit as 'm2'|'ft2'|'ha',basis:value.basis},reviewStatus:candidate.review.status,scaleStatus:null}]:[];});
 if(geometry?.geometry.unit==='m')for(const room of geometry.geometry.rooms){const amount=(ringArea(room.polygon)-room.holes.reduce((sum,hole)=>sum+ringArea(hole),0)).toFixed(8);areas.push({id:room.id,origin:'geometry',field:'roomNetArea',quantity:{amount,unit:'m2',basis:'geometry_room_net'},reviewStatus:'pending',scaleStatus:geometry.geometry.scaleStatus});}
 const comparisons:Array<ReturnType<typeof compareAreaQuantities>>=[];let comparisonsTruncated=false;
 for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++){if(comparisons.length===1000){comparisonsTruncated=true;break;}comparisons.push(compareAreaQuantities(areas[i],areas[j]));}
 const pages=(await c.query(`SELECT ar.quality_report FROM artifacts ar JOIN processing_stages stage ON stage.id=ar.stage_id AND stage.digitization_id=ar.digitization_id AND stage.input_revision=ar.input_revision AND stage.state='succeeded'
  JOIN digitization_asset_bindings binding ON binding.digitization_id=ar.digitization_id AND binding.input_revision=ar.input_revision AND binding.asset_id::text=ar.quality_report->>'sourceAssetId' AND binding.purpose='document'
  WHERE ar.digitization_id=$1 AND ar.input_revision=$2 AND ar.status='private' AND ((ar.format='application/json' AND ar.quality_report->>'kind'='native_fact_candidates' AND stage.stage_type='fact_extract') OR (ar.format='image/png' AND ar.quality_report->>'kind'='document_ocr_page' AND stage.stage_type='document_ocr')) ORDER BY ar.created_at DESC,ar.id LIMIT 1001`,[engine,workspace.inputRevision])).rows;
 if(pages.length>1000)fail(422,'The document quality receipts exceed their bounded summary.','QUALITY_RECEIPT_BUDGET');
 let unresolvedOcrPages;try{unresolvedOcrPages=countUnresolvedOcrPages(pages.map(row=>row.quality_report));}catch{fail(422,'The document quality receipt is invalid.','QUALITY_RECEIPT_INVALID');}
 const camera=await latestCameraReview(c,a,engine),reconstruction=camera?{artifactId:camera.artifactId,registeredCameraCount:camera.registeredCameraCount,selectedFrameCount:camera.selectedFrameCount,connectedComponentCount:camera.connectedComponentCount,pointCount:camera.pointCount,advisoryQualityPassed:camera.state==='awaiting_review',scaleStatus:'unscaled',roomCoverage:null,reviewRequired:true}:null;
 return digitizationQualitySummary.parse({workspaceVersion:workspace.version,inputRevision:workspace.inputRevision,factCount:facts.candidates.length,pendingFactCount:facts.candidates.filter(f=>f.review.status==='pending').length,conflictingFields:facts.conflictingFields,unresolvedOcrPages,geometryRevisionId:geometry?.geometry.id??null,geometryScaleStatus:geometry?.geometry.scaleStatus??null,areas,comparisons,comparisonsTruncated,reconstruction,reviewRequired:true,publiclyServed:false});
}
