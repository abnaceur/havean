import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {fail} from '../../platform/core.js';
import {digitizationListingAccess} from '../property-access.js';
export const workspaceColumns=`id,organization_id AS "organizationId",created_by AS "createdBy",target_type AS "targetType",target_id AS "targetId",unit_id AS "unitId",listing_id AS "listingId",state,version,current_input_revision AS "inputRevision"`;
export function workspaceRecord(row:any){const {targetType,targetId,...record}=row;return {...record,target:{type:targetType,id:targetId,...(targetType==='listing'?{unitId:record.unitId}:{})},capabilities:{ocrAvailable:false as const,reconstructionAvailable:false as const,privateEvidenceRequiresGrant:true as const}};}
export async function requireDigitizationAgency(c:pg.PoolClient,a:Actor){
 if(!a.orgId||!(await c.query(`SELECT 1 FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' JOIN organizations o ON o.id=m.organization_id AND o.type='agency' WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status='active' AND m.role IN('agent','agency_manager') AND m.role=ANY($3::text[])`,[a.id,a.orgId,a.roles])).rowCount)fail(403,'A current agency assignment is required','DIGITIZATION_SCOPE_REQUIRED');
}
export async function checkedWorkspace(c:pg.PoolClient,id:string,type?:'intake'|'listing',listingId?:string){
 const row=(await c.query(`SELECT ${workspaceColumns} FROM property_digitizations WHERE id=$1 FOR UPDATE`,[id])).rows[0];
 if(!row||type&&row.targetType!==type||listingId&&row.listingId!==listingId)fail(404,'Digitization workspace not found');
 return workspaceRecord(row);
}
export async function createIntake(c:pg.PoolClient,a:Actor){
 await requireDigitizationAgency(c,a);const id=crypto.randomUUID();
 const row=(await c.query(`INSERT INTO property_digitizations(id,organization_id,created_by,target_type,target_id) VALUES($1,$2,$3,'intake',$1) RETURNING ${workspaceColumns}`,[id,a.orgId,a.id])).rows[0];
 await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.intake_created','draft')",[id,a.orgId,a.id]);
 await event(c,a,id,'digitization.intake_created',{version:row.version});return workspaceRecord(row);
}
export async function createListingDigitization(c:pg.PoolClient,a:Actor,id:string,expected:number){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['digitization:'+a.orgId+':'+id]);
 await digitizationListingAccess(c,a,id);const target=(await c.query('SELECT version,status,unit_id,organization_id FROM listings WHERE id=$1 FOR SHARE',[id])).rows[0];
 if(target.version!==expected)fail(409,'The listing changed. Reload before creating its digitization.','VERSION_CONFLICT');
 if(!['draft','submitted','published','paused','expired','rejected'].includes(target.status))fail(409,'This listing no longer accepts a new digitization draft.','WORKFLOW_CONFLICT');
 const existing=(await c.query(`SELECT ${workspaceColumns} FROM property_digitizations WHERE target_type='listing' AND target_id=$1 AND organization_id=$2 AND state='active'`,[id,target.organization_id])).rows[0];
 if(existing)return workspaceRecord(existing);
 const row=(await c.query(`INSERT INTO property_digitizations(organization_id,created_by,target_type,target_id,listing_id,unit_id) VALUES($1,$2,'listing',$3,$3,$4) RETURNING ${workspaceColumns}`,[target.organization_id,a.id,id,target.unit_id])).rows[0];
 await event(c,a,row.id,'digitization.created',{version:row.version,listingId:id,listingVersion:target.version});return workspaceRecord(row);
}
export async function grantOwnerEvidence(c:pg.PoolClient,a:Actor,id:string,x:{digitizationVersion:number;assetId:string;assetVersion:number;inputRevision:number;granteeId:string;purposes:string[];expiresAt:string}){
 const workspace=await checkedWorkspace(c,id);if(workspace.version!==x.digitizationVersion)fail(409,'The digitization changed. Reload before granting access.','VERSION_CONFLICT');
 const asset=(await c.query("SELECT id FROM media_assets WHERE id=$1 AND owner_id=$2 AND version=$3 AND visibility='private' AND purpose='document' AND status='approved' AND scan_at IS NOT NULL FOR SHARE",[x.assetId,a.id,x.assetVersion])).rows[0];
 if(!asset)fail(404,'Owned scanned evidence not found');
 if(!(await c.query('SELECT digitization_grant_revision_exists($1,$2) AS allowed',[id,x.inputRevision])).rows[0].allowed)fail(422,'Select an existing source revision.','INPUT_REVISION_REQUIRED');
 if(!(await c.query('SELECT digitization_actor_target($1,$2,$3,$4,$5,$6) AS allowed',[x.granteeId,workspace.organizationId,workspace.createdBy,workspace.target.type,workspace.target.id,workspace.unitId])).rows[0].allowed)fail(404,'Currently authorized evidence recipient not found');
 const expires=Date.parse(x.expiresAt);if(expires<=Date.now()||expires>Date.now()+90*86400000)fail(422,'Choose an access expiry within 90 days.','GRANT_EXPIRY_INVALID');
 const row=(await c.query(`INSERT INTO digitization_evidence_grants(digitization_id,organization_id,asset_id,asset_version,input_revision,owner_id,grantee_id,granted_by,purposes,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$6,$8,$9) RETURNING id,digitization_id AS "digitizationId",asset_id AS "assetId",asset_version AS "assetVersion",input_revision AS "inputRevision",grantee_id AS "granteeId",purposes,state,version,expires_at AS "expiresAt"`,[id,workspace.organizationId,x.assetId,x.assetVersion,x.inputRevision,a.id,x.granteeId,x.purposes,x.expiresAt])).rows[0];
 await event(c,a,id,'digitization.evidence_granted',{grantId:row.id,version:row.version,inputRevision:x.inputRevision});return {...row,expiresAt:row.expiresAt.toISOString()};
}
