import '../support/env';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {afterAll,it,expect} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
import {readScenePrivacy,saveScenePrivacy} from '../../apps/api/src/inventory/digitization/scene-privacy';
import {readPrivateSceneTier} from '../../apps/api/src/inventory/digitization/scene-preview';
import {captureStorage} from '../../apps/api/src/inventory/digitization/multipart';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
const foreign:Actor={id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']};
const fixture=()=>JSON.parse(readFileSync('infra/generated/integration/scene-preview-desktop.json','utf8'));
afterAll(()=>pool.end());
it('actual private exported tier records immutable pending privacy history with stale, scope, bytes and workflow refusal',async()=>{
 const {engineId,artifactId}=fixture(),context=await transaction(actor,c=>readScenePrivacy(c,actor,engineId));
 expect(context.geometryRevisionId).toBeNull();expect(context.rooms).toEqual([]);
 const input={workspaceVersion:context.workspaceVersion,inputRevision:context.inputRevision,artifactId,geometryRevisionId:null,coverage:[],inspection:'issues_found' as const,note:'Authored exported scene needs independent privacy inspection.'};
 await expect(transaction(actor,c=>saveScenePrivacy(c,actor,engineId,{...input,workspaceVersion:input.workspaceVersion+1}))).rejects.toMatchObject({status:409});
 await expect(transaction(foreign,c=>readScenePrivacy(c,foreign,engineId))).rejects.toMatchObject({status:404});
 await expect(transaction(actor,c=>saveScenePrivacy(c,actor,engineId,{...input,artifactId:crypto.randomUUID()}))).rejects.toMatchObject({status:404});
 await expect(transaction(actor,c=>saveScenePrivacy(c,actor,engineId,{...input,geometryRevisionId:crypto.randomUUID()}))).rejects.toMatchObject({status:409});
 const bytes=await readPrivateSceneTier(actor,engineId,artifactId);expect(bytes.length).toBeGreaterThan(0);
 const saved=await transaction(actor,c=>saveScenePrivacy(c,actor,engineId,input));
 expect(saved).toMatchObject({reviewStatus:'pending',privacyReviewRequired:true,publiclyServed:false,current:true,coverage:[]});
 await expect(transaction(actor,c=>saveScenePrivacy(c,actor,engineId,input))).rejects.toMatchObject({status:409});
 await transaction(actor,async c=>{expect((await c.query("UPDATE digitization_scene_privacy_declarations SET inspection='ready_for_independent_review' WHERE id=$1",[saved.id])).rowCount).toBe(0);expect((await c.query('DELETE FROM digitization_scene_privacy_declarations WHERE id=$1',[saved.id])).rowCount).toBe(0);});
 const concurrent=await Promise.allSettled([0,1].map(()=>transaction(actor,c=>saveScenePrivacy(c,actor,engineId,{...input,workspaceVersion:saved.workspaceVersion,inspection:'not_inspected'}))));expect(concurrent.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(concurrent.filter(result=>result.status==='rejected')).toHaveLength(1);const second=(concurrent.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<typeof saved>).value;
 await expect(transaction(actor,async c=>{await c.query(`INSERT INTO digitization_scene_privacy_declarations(digitization_id,organization_id,created_by,workspace_version,input_revision,artifact_id,artifact_version,artifact_checksum,geometry_revision_id,coverage,inspection,note) SELECT digitization_id,organization_id,created_by,$2,input_revision,artifact_id,artifact_version,artifact_checksum,geometry_revision_id,'[{"roomId":"foreign-room","status":"covered"}]'::jsonb,inspection,note FROM digitization_scene_privacy_declarations WHERE id=$1`,[second.id,second.workspaceVersion]);})).rejects.toMatchObject({code:'23514'});
 await expect(transaction(actor,async c=>{await c.query("UPDATE property_digitizations SET state='archived',version=version+1 WHERE id=$1",[engineId]);await saveScenePrivacy(c,actor,engineId,{...input,workspaceVersion:second.workspaceVersion+1});})).rejects.toBeDefined();
 const history=await transaction(actor,c=>readScenePrivacy(c,actor,engineId));expect(history.declarations.find(row=>row.id===saved.id)?.inspection).toBe('issues_found');expect(history.declarations.find(row=>row.id===second.id)?.inspection).toBe('not_inspected');
 const {object_key:key}=await transaction(actor,async c=>(await c.query('SELECT object_key FROM artifacts WHERE id=$1',[artifactId])).rows[0]),storage=captureStorage(),{PutObjectCommand}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('@aws-sdk/client-s3');
 try{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:key,Body:Buffer.alloc(bytes.length)}));await expect(readPrivateSceneTier(actor,engineId,artifactId)).rejects.toMatchObject({status:422});}finally{await storage.send(new PutObjectCommand({Bucket:'haven-private',Key:key,Body:bytes}));storage.destroy();}
 const source=await transaction(actor,async c=>(await c.query('SELECT source_set FROM property_input_revisions WHERE digitization_id=$1 AND revision=$2',[engineId,input.inputRevision])).rows[0].source_set[0]);
 try{await transaction(actor,c=>c.query("UPDATE media_assets SET status='rejected' WHERE id=$1",[source.assetId]));await expect(transaction(actor,c=>saveScenePrivacy(c,actor,engineId,{...input,workspaceVersion:second.workspaceVersion}))).rejects.toBeDefined();const unavailable=await transaction(actor,c=>readScenePrivacy(c,actor,engineId)).catch(()=>null);expect(unavailable===null||unavailable.declarations.length===0).toBe(true);}finally{await transaction(actor,c=>c.query("UPDATE media_assets SET status='approved' WHERE id=$1",[source.assetId]));}
 await transaction(actor,async c=>{const w=await checkedWorkspace(c,engineId);expect(w.version).toBe(second.workspaceVersion);});
});
