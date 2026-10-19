import '../support/env';
import {readFileSync} from 'node:fs';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {readGeometryPng,readGeometryGlb} from '../../apps/api/src/inventory/digitization/geometry-preview';
import {readGeometryDraft} from '../../apps/api/src/inventory/digitization/geometry-drafts';
import {renderPlanPng} from '../../apps/api/src/inventory/digitization/plan-render';
import {renderStructuralGlb} from '../../apps/api/src/inventory/digitization/structural-glb';
import {saveSuppliedGeometryDimensions} from '../../apps/api/src/inventory/digitization/geometry-dimensions';
const fixture=JSON.parse(readFileSync('infra/generated/integration/plan-editor-conflicts.json','utf8')),agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
it('current private PNG preview matches persisted geometry exactly and neither changes its review nor creates an artifact',async()=>{
 const before=await transaction(agent,async c=>({draft:await readGeometryDraft(c,agent,fixture.engineId),artifacts:(await c.query('SELECT count(*)::int n FROM artifacts WHERE digitization_id=$1',[fixture.engineId])).rows[0].n}));
 if(!before.draft)throw new Error('Run the real plan-editor fixture/checkpoint lane first');
 const preview=await readGeometryPng(agent,fixture.engineId,undefined,512);
 expect(preview.equals(await renderPlanPng(before.draft.geometry,before.draft.geometry.floors[0].id,512))).toBe(true);
 const after=await transaction(agent,async c=>({draft:await readGeometryDraft(c,agent,fixture.engineId),artifacts:(await c.query('SELECT count(*)::int n FROM artifacts WHERE digitization_id=$1',[fixture.engineId])).rows[0].n}));expect(after).toEqual(before);expect(after.draft?.geometry.review.status).toBe('pending');
 await expect(readGeometryPng({...agent,id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']},fixture.engineId)).rejects.toMatchObject({status:403});
 await expect(readGeometryPng(agent,fixture.engineId,'not-a-floor')).rejects.toMatchObject({status:422});
});
it('actual private GLB preserves supplied dimensions and pending review; stale dimension changes cannot create a child',async()=>{
 const dimensions=JSON.parse(readFileSync('infra/generated/integration/plan-editor-desktop-dimensions.json','utf8'));
 const before=await transaction(agent,async c=>({draft:await readGeometryDraft(c,agent,dimensions.engineId),artifacts:(await c.query('SELECT count(*)::int n FROM artifacts WHERE digitization_id=$1',[dimensions.engineId])).rows[0].n,approvals:(await c.query('SELECT count(*)::int n FROM approval_records WHERE digitization_id=$1',[dimensions.engineId])).rows[0].n}));
 if(!before.draft)throw new Error('Run the real dimension-entry browser journey first');
 expect(before.draft.geometry.floors[0].height?.basis).toBe('supplied_unverified');
 const actual=await readGeometryGlb(agent,dimensions.engineId);expect(actual.body.equals(renderStructuralGlb(before.draft.geometry).body)).toBe(true);expect(actual.privacyReview).toBe('pending');expect(actual.publicationReview).toBe('pending');
 const marker=new Error('rollback supplied dimension policy');try{await transaction(agent,async c=>{
  const draft=before.draft!;const command={version:draft.workspaceVersion,geometryRevisionId:draft.geometry.id,floorId:draft.geometry.floors[0].id,heightMetres:'3.25',note:'Self-authored rollback supplied dimensions policy',suppliedDimensionsConfirmed:true as const,openings:[]};
  await expect(saveSuppliedGeometryDimensions(c,agent,dimensions.engineId,{...command,version:command.version-1})).rejects.toMatchObject({status:409});
  const child=await saveSuppliedGeometryDimensions(c,agent,dimensions.engineId,command);expect(child.geometry.parentRevision).toBe(draft.geometry.revision);expect(child.geometry.review).toEqual({status:'pending',actorId:null});expect(child.geometry.openings).toEqual(draft.geometry.openings);
  await expect(saveSuppliedGeometryDimensions(c,agent,dimensions.engineId,command)).rejects.toMatchObject({status:409});throw marker;
 });}catch(error){if(error!==marker)throw error;}
 const after=await transaction(agent,async c=>({draft:await readGeometryDraft(c,agent,dimensions.engineId),artifacts:(await c.query('SELECT count(*)::int n FROM artifacts WHERE digitization_id=$1',[dimensions.engineId])).rows[0].n,approvals:(await c.query('SELECT count(*)::int n FROM approval_records WHERE digitization_id=$1',[dimensions.engineId])).rows[0].n}));expect(after).toEqual(before);
});
