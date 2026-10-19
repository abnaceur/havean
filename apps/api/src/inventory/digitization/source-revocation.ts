import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {digitizationEvidenceGrantRecord,digitizationModelSourceRevoke} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {checkedWorkspace} from './intakes.js';
export async function checkedOwnerSourceGrant(c:pg.PoolClient,a:Actor,engine:string,grant:string){
 const workspace=await checkedWorkspace(c,engine);
 const row=(await c.query('SELECT * FROM digitization_evidence_grants WHERE id=$1 AND digitization_id=$2 AND owner_id=$3 FOR UPDATE',[grant,engine,a.id])).rows[0];
 if(!row)fail(404,'Owned source grant not found.');
 return {workspace,row};
}
export async function revokeOwnerSourceGrant(c:pg.PoolClient,a:Actor,engine:string,grant:string,x:ReturnType<typeof digitizationModelSourceRevoke.parse>){
 const {workspace,row}=await checkedOwnerSourceGrant(c,a,engine,grant);
 if(workspace.version!==x.workspaceVersion||row.version!==x.grantVersion)fail(409,'The workspace or grant changed. Refresh before revoking.','VERSION_CONFLICT');
 if(row.state!=='active')fail(409,'This source grant is already revoked.','WORKFLOW_CONFLICT');
 const result=(await c.query(`UPDATE digitization_evidence_grants SET state='revoked',version=version+1 WHERE id=$1 RETURNING id,digitization_id AS "digitizationId",asset_id AS "assetId",asset_version AS "assetVersion",input_revision AS "inputRevision",grantee_id AS "granteeId",purposes,state,version,expires_at AS "expiresAt"`,[grant])).rows[0];
 await event(c,a,engine,'digitization.evidence_revoked',{grantId:grant,version:result.version,reason:x.reason});
 return digitizationEvidenceGrantRecord.parse({...result,expiresAt:result.expiresAt.toISOString()});
}
