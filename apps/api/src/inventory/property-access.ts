import type pg from 'pg';
import type {Actor} from '@haven/database';
import {fail} from '../platform/core.js';
import {canReadPrivateEvidence} from './moderation-evidence.js';

export type PropertyResource='listings'|'developments';

// Shared legacy authoring check. Keep the rich-media workflow and RLS behaviour
// intact; digitization's stricter evidence checks are independent of this port.
export async function editableProperty(c:pg.PoolClient,a:Actor,id:string,type:PropertyResource){
 const record=(await c.query(type==='listings'?'SELECT id,title,owner_id,organization_id,agent_id,version,status FROM listings WHERE id=$1 FOR UPDATE':'SELECT id,name AS title,organization_id,version,status FROM developments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const allowed=type==='listings'?['agent','agency_manager']:['developer'];
 if(!record||!(a.roles.some(r=>['admin','moderator'].includes(r))||record.owner_id===a.id||record.organization_id===a.orgId&&a.roles.some(r=>allowed.includes(r))))fail(404,'Editable property not found');
 if(type==='listings'&&a.roles.includes('agent')&&!a.roles.some(r=>['admin','agency_manager'].includes(r))&&record.owner_id!==a.id&&!(await c.query('SELECT 1 FROM agents WHERE id=$1 AND user_id=$2',[record.agent_id,a.id])).rowCount)fail(404,'This property is not assigned to you');
 return record;
}

// This is target authoring authority only. It never grants access to evidence.
// Actual current membership defeats cached role labels and the search worker's
// privileged actor. Owner authorization must still be current for this unit.
export async function digitizationListingAccess(c:pg.PoolClient,a:Actor,id:string){
 const record=(await c.query(`SELECT l.id,l.unit_id,l.organization_id,l.owner_id,l.agent_id,l.version,l.status
 FROM listings l JOIN profiles p ON p.id=$2 AND p.state='active'
 WHERE l.id=$1 AND actor_id()=$2 AND (
  (l.owner_id=$2 AND 'owner'=ANY($4::text[]) AND EXISTS(
   SELECT 1 FROM owner_unit_grants g WHERE g.unit_id=l.unit_id AND g.owner_id=$2 AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp())))
  OR (l.organization_id=$3 AND org_id()=$3 AND EXISTS(
   SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id AND o.type='agency'
   WHERE m.user_id=$2 AND m.organization_id=$3 AND m.status='active' AND m.role=ANY($4::text[]) AND (
    m.role='agency_manager' OR (m.role='agent' AND EXISTS(SELECT 1 FROM agents agent WHERE agent.id=l.agent_id AND agent.user_id=$2 AND agent.organization_id=$3)))))
 ) FOR SHARE OF l`,[id,a.id,a.orgId,a.roles])).rows[0];
 if(!record)fail(404,'Authorized digitization property not found');
 return record;
}

// Legacy owner/reviewer document access, with current persisted identity/grant
// checks for engine previews. A processing grant is a separate capability; this
// function cannot authorize a runner or return an arbitrary provider object key.
export async function digitizationDocumentPreviewAccess(c:pg.PoolClient,a:Actor,assetId:string,listingId?:string){
 const asset=(await c.query(`SELECT m.id,m.owner_id,m.mime,m.version FROM media_assets m JOIN profiles p ON p.id=$2 AND p.state='active'
 WHERE m.id=$1 AND actor_id()=$2 AND m.visibility='private' AND m.purpose='document' AND m.status='approved' AND m.scan_at IS NOT NULL`,[assetId,a.id])).rows[0];
 if(!asset)fail(404,'Private evidence not found');
 // A supplied listing ID narrows the request; it cannot broaden asset access.
 if(listingId){const target=await digitizationListingAccess(c,a,listingId);if(target.owner_id!==asset.owner_id)fail(404,'Private evidence not found');}
 if(asset.owner_id!==a.id){
  const role=(await c.query(`SELECT 1 FROM memberships WHERE user_id=$1 AND status='active' AND role IN('admin','moderator') AND role=ANY($3::text[]) AND (organization_id IS NULL OR organization_id=$2)`,[a.id,a.orgId,a.roles])).rowCount;
  if(!role||!(await canReadPrivateEvidence(c,a,assetId,asset.owner_id)))fail(404,'Private evidence not found');
 }
 return asset;
}
