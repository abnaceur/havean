import '../support/env';
import {readFileSync} from 'node:fs';
import {afterAll,expect,it} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {listPlanPages} from '../../apps/api/src/inventory/digitization/plan-selection';
import {readPlanProposals} from '../../apps/api/src/inventory/digitization/plan-proposals';
import {checkedWorkspace} from '../../apps/api/src/inventory/digitization/intakes';
const fixture=JSON.parse(readFileSync('infra/generated/integration/plan-editor-conflicts.json','utf8'));
const agent:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
afterAll(()=>pool.end());
async function state(){return transaction(agent,async c=>({workspace:await checkedWorkspace(c,fixture.engineId),pages:await listPlanPages(c,agent,fixture.engineId),revisions:(await c.query('SELECT count(*)::int n FROM geometry_revisions WHERE digitization_id=$1',[fixture.engineId])).rows[0].n}));}
it('actual private source pixels yield bounded unconfirmed suggestions in the selected rotated coordinate space',async()=>{
 const before=await state();expect(before.pages.length).toBeGreaterThan(0);
 const result=await readPlanProposals(agent,fixture.engineId,before.pages[0].artifactId,90,before.workspace.version,before.workspace.inputRevision);
 expect(result.lines.length).toBeGreaterThan(0);expect(result.lines.length).toBeLessThanOrEqual(200);
 expect(result.lines.every(line=>line.confirmed===false&&[line.start,line.end].every(p=>p.x>=0&&p.y>=0&&p.x<=result.selection.width&&p.y<=result.selection.height))).toBe(true);
 expect(result.reviewRequired).toBe(true);expect(result.scaleStatus).toBe('unscaled');expect(await state()).toEqual(before);
 await expect(readPlanProposals(agent,fixture.engineId,before.pages[0].artifactId,0,before.workspace.version-1,before.workspace.inputRevision)).rejects.toMatchObject({status:409});
 await expect(readPlanProposals({...agent,id:'00000000-0000-4000-8000-000000000011',orgId:'10000000-0000-4000-8000-000000000005',roles:['agency_manager']},fixture.engineId,before.pages[0].artifactId,0,before.workspace.version,before.workspace.inputRevision)).rejects.toMatchObject({status:404});
});
