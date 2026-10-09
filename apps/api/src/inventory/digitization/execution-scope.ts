import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationExecutionRequest} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {requireCurrentExecution} from './leases.js';

type SourceSnapshot={assetId:string;assetVersion:number;purpose:string;sha256:string;bytes:string;detectedMime:string;decoderState:string};
const profiles:Record<string,{stage:string;mime:readonly string[]}>= {
 'pdfium-150dpi-v1':{stage:'document_rasterize',mime:['application/pdf']},
 'upright-image-v1':{stage:'document_rasterize',mime:['image/jpeg','image/png']},
 ...Object.fromEntries(['en','fr','ar'].map(locale=>['generic-native-facts-'+locale+'-v1',{stage:'fact_extract',mime:['application/pdf']}]))
};
/** Server-prepared stage fingerprint: scope and immutable content/configuration,
 * independent of attempts/leases. No cross-workspace content reuse.
 */
export function cpuSourceFingerprint(engine:string,organizationId:string,inputRevision:number,profileId:string,source:SourceSnapshot){
 return createHash('sha256').update(JSON.stringify({version:1,engine,organizationId,inputRevision,profileId,source:{assetId:source.assetId,assetVersion:source.assetVersion,purpose:source.purpose,sha256:source.sha256,bytes:source.bytes,detectedMime:source.detectedMime,decoderState:source.decoderState}})).digest('hex');
}
/** Short transaction only. Call again after source transfer before any commit.
 * Storage transfer and HMAC issuance happen outside SQL; this port returns no key.
 */
export async function prepareCpuExecution(c:pg.PoolClient,a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,assetId:string){
 const stage=await requireCurrentExecution(c,a,engine,stageId,executionId,fencingToken);
 const profile=profiles[stage.profile_id];
 if(!profile||profile.stage!==stage.stage_type)fail(422,'This processing profile is unavailable.','PROFILE_UNAVAILABLE');
 const snapshot=(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engine,stage.input_revision])).rows[0];
 const matches=(snapshot?.source_set??[]).filter((item:SourceSnapshot)=>item.assetId===assetId) as SourceSnapshot[];
 if(matches.length>1)fail(422,'Select an unambiguous source binding for this execution.','SOURCE_SELECTION_AMBIGUOUS');
 const source=matches[0];
 if(!source||stage.stage_type==='fact_extract'&&source.purpose!=='document'||!['document','plan'].includes(source.purpose)||!profile.mime.includes(source.detectedMime))fail(404,'Current processing source not found.','SOURCE_NOT_FOUND');
 if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,stage.profile_id,source)!==stage.input_fingerprint)fail(409,'The execution inputs or profile changed.','INPUT_FINGERPRINT_CONFLICT');
 if(!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') allowed",[engine,source.assetId,source.assetVersion,stage.input_revision])).rows[0].allowed)fail(403,'Current evidence processing authority is required.','SOURCE_ACCESS_CHANGED');
 return buildCpuExecutionRequest(a,engine,stageId,executionId,fencingToken,stage,source);
}
/** Trusted metadata only; callers separately authorize execution or cancellation.
 * A cancellation command never receives source bytes or a read capability.
 */
export function buildCpuExecutionRequest(a:Actor,engine:string,stageId:string,executionId:string,fencingToken:string,stage:any,source:SourceSnapshot){
 const profile=profiles[stage.profile_id];
 if(!profile||profile.stage!==stage.stage_type||!profile.mime.includes(source.detectedMime))fail(422,'This processing profile is unavailable.','PROFILE_UNAVAILABLE');
 if(cpuSourceFingerprint(engine,a.orgId!,stage.input_revision,stage.profile_id,source)!==stage.input_fingerprint)fail(409,'The execution inputs or profile changed.','INPUT_FINGERPRINT_CONFLICT');
 const budget=stage.run_budget;
 if(!Number.isSafeInteger(budget.maxSeconds)||budget.maxSeconds<1||typeof budget.maxScratchBytes!=='string'||!/^\d{1,13}$/.test(budget.maxScratchBytes)||Number(budget.maxScratchBytes)<Number(source.bytes)+32*1024*1024)fail(422,'The run budget cannot support source decoding.','EXECUTION_BUDGET_INVALID');
 return digitizationExecutionRequest.parse({schemaVersion:1,executionId,organizationId:a.orgId,runId:stage.run_id,stageId,stageType:stage.stage_type,profileId:stage.profile_id,inputRevision:stage.input_revision,inputFingerprint:stage.input_fingerprint,fencingToken,artifacts:[{id:source.assetId,checksum:source.sha256,byteSize:source.bytes,detectedMime:source.detectedMime}],deadline:new Date(stage.deadline).toISOString(),budget:{maxSeconds:Math.min(15,budget.maxSeconds),maxScratchBytes:String(Math.min(64*1024*1024,Number(budget.maxScratchBytes)))}});
}
