import '../support/env';
import {readFileSync} from 'node:fs';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
import {readPlanPageSelection} from '../../apps/api/src/inventory/digitization/plan-selection';
import {checkpointTrace,traceConflict} from '../../apps/api/src/inventory/digitization/trace-checkpoints';
import {saveGeometryDraft} from '../../apps/api/src/inventory/digitization/geometry-drafts';
import type {DigitizationGeometryRevision} from '../../packages/contracts/src/index';
const fixture=JSON.parse(readFileSync('infra/generated/integration/plan-editor-conflicts.json','utf8')),agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']},peer:Actor=fixture.peer;
afterAll(()=>pool.end());
it('HE-E07 two distinct current reviewers preserve their own checkpoints and the winning canonical reference on a real concurrent 409',async()=>{
 const w=await transaction(agent,c=>checkedWorkspace(c,fixture.engineId)),selections=await Promise.all([agent,peer].map(a=>readPlanPageSelection(a,fixture.engineId,fixture.artifactId,0)));
 const drafts=[agent,peer].map((a,i):DigitizationGeometryRevision=>({schemaVersion:2,id:crypto.randomUUID(),organizationId:w.organizationId!,targetId:w.target.id,revision:1,parentRevision:null,coordinateSystem:'right-handed-z-up',unit:'px',scaleStatus:'unscaled',sourceAssets:[fixture.sourceAssetId],sources:[selections[i].source],scaleAnchors:[],floors:[{id:'floor-1',name:'Ground',elevation:'0',height:null,source:selections[i].source}],rooms:[],walls:[{id:'wall-'+i,floorId:'floor-1',start:{x:128,y:128+i*32},end:{x:512,y:128+i*32},thickness:'3',height:null,source:selections[i].source,confirmed:false}],openings:[],stairs:[],review:{status:'pending',actorId:null}}));
 const bodies=drafts.map(geometry=>({version:w.version,artifactId:fixture.artifactId,clockwiseDegrees:0,geometry})),actors=[agent,peer];
 const checkpoints=await Promise.all(actors.map((a,i)=>transaction(a,c=>checkpointTrace(c,a,fixture.engineId,{...bodies[i],checkpointId:crypto.randomUUID()},selections[i]))));expect(checkpoints[0].id).not.toBe(checkpoints[1].id);
 const saves=await Promise.allSettled(actors.map((a,i)=>transaction(a,c=>saveGeometryDraft(c,a,fixture.engineId,bodies[i],selections[i]))));expect(saves.filter(r=>r.status==='fulfilled')).toHaveLength(1);const failed=saves.find(r=>r.status==='rejected');expect(failed).toMatchObject({status:'rejected',reason:{status:409}});const winner=saves.find(r=>r.status==='fulfilled');if(winner?.status!=='fulfilled')throw Error('Missing immutable winner');
 const references=await Promise.all(actors.map(a=>transaction(a,c=>traceConflict(c,a,fixture.engineId))));for(let i=0;i<2;i++){expect(references[i].checkpoint).toMatchObject({id:checkpoints[i].id,geometry:{id:drafts[i].id}});expect(references[i].current?.geometry.id).toBe(winner.value.geometry.id);expect(references[i].checkpoint?.geometry.walls[0].start.y).toBe(128+i*32);}
 const inaccessible=await transaction(agent,c=>c.query('SELECT id FROM digitization_trace_checkpoints WHERE id=$1',[checkpoints[1].id]));expect(inaccessible.rowCount).toBe(0);
 await expect(transaction(peer,c=>checkpointTrace(c,peer,fixture.engineId,{...bodies[1],checkpointId:crypto.randomUUID()},selections[1]))).rejects.toMatchObject({status:409});expect((await transaction(peer,c=>traceConflict(c,peer,fixture.engineId))).checkpoint?.id).toBe(checkpoints[1].id);
},30000);
