import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {fail} from '../../platform/core.js';
import {recordInputChange} from './input-invalidation.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import type {verifySmallDigitizationSource} from './source-validation.js';
type VerifiedSource=Omit<Awaited<ReturnType<typeof verifySmallDigitizationSource>>,'body'>;

/** Reserve only an opaque next-revision identity. No source snapshot or access
 * capability is created; owners must grant each exact asset/version themselves.
 */
export async function reserveInputRevision(c:pg.PoolClient,a:Actor,id:string,expectedVersion:number){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,id);
 if(workspace.state!=='active'||workspace.version!==expectedVersion)fail(409,'The input set changed. Reload before preparing sources.','VERSION_CONFLICT');
 const revision=workspace.inputRevision+1;
 await c.query('INSERT INTO digitization_input_slots(digitization_id,organization_id,created_by,revision) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,a.orgId,a.id,revision]);
 return {digitizationId:id,inputRevision:revision,version:workspace.version};
}

/** Commit authoritative byte checks from the server's out-of-transaction validator.
 * These sources remain decoder-pending; this operation does not enable processing.
 */
export async function appendInputRevision(c:pg.PoolClient,a:Actor,id:string,expectedVersion:number,sources:readonly VerifiedSource[]){
 await requireDigitizationAgency(c,a);const workspace=await checkedWorkspace(c,id);
 if(workspace.version!==expectedVersion)fail(409,'The input set changed. Reload before saving sources.','VERSION_CONFLICT');
 if(sources.length>100||new Set(sources.map(s=>`${s.assetId}:${s.purpose}`)).size!==sources.length)fail(422,'Select distinct supported sources.','INVALID_SOURCE_SET');
 const revision=workspace.inputRevision+1;
 for(const source of sources){
  if(source.inputRevision!==revision||!['requires_isolated_pdf_decoder','requires_isolated_image_decoder'].includes(source.decoderState)||!/^[a-f0-9]{64}$/.test(source.sha256))fail(422,'Source validation does not match this revision.','INVALID_SOURCE_VALIDATION');
  const asset=(await c.query('SELECT * FROM digitization_source_descriptor($1,$2,$3,$4)',[id,source.assetId,source.assetVersion,revision])).rows[0];
  if(!asset||asset.mime!==source.detectedMime||Number(asset.size)!==source.bytes||!(await c.query("SELECT digitization_asset_access($1,$2,$3,$4,'document_processing') AS allowed",[id,source.assetId,source.assetVersion,revision])).rows[0].allowed)fail(403,'Source authority or version changed. Validate the current upload.','SOURCE_ACCESS_CHANGED');
 }
 const previous=workspace.inputRevision?(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[id,workspace.inputRevision])).rows[0]?.source_set??null:[];
 const snapshot=sources.map(s=>({assetId:s.assetId,assetVersion:s.assetVersion,purpose:s.purpose,sha256:s.sha256,bytes:String(s.bytes),detectedMime:s.detectedMime,decoderState:s.decoderState}));
 await c.query(`INSERT INTO property_input_revisions(digitization_id,organization_id,created_by,revision,source_set) VALUES($1,$2,$3,$4,$5)`,[id,a.orgId,a.id,revision,JSON.stringify(snapshot)]);
 const bindings=[];
 for(const source of sources){
  const sensitivity=source.purpose==='document'||source.purpose==='plan'?'private_evidence':'gallery';
  bindings.push((await c.query(`INSERT INTO digitization_asset_bindings(digitization_id,organization_id,created_by,input_revision,asset_id,asset_version,purpose,sensitivity,source_lineage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[id,a.orgId,a.id,revision,source.assetId,source.assetVersion,source.purpose,sensitivity,{sha256:source.sha256,bytes:String(source.bytes),detectedMime:source.detectedMime,decoderState:source.decoderState}])).rows[0].id);
 }
 await c.query('UPDATE property_digitizations SET current_input_revision=$2,version=version+1 WHERE id=$1',[id,revision]);
 await recordInputChange(c,a,id,workspace.inputRevision,revision,previous,snapshot);
 await c.query(`INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.inputs_changed','draft')`,[id,a.orgId,a.id]);
 await event(c,a,id,'digitization.inputs_changed',{inputRevision:revision,sourceCount:sources.length});
 return {digitizationId:id,inputRevision:revision,version:workspace.version+1,bindingIds:bindings,processingEligible:false as const};
}
