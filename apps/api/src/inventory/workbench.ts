import type {Actor} from '@haven/database';
import {listingTransitions} from '@haven/contracts';
export function inventoryActions(actor:Actor,row:{status:string;transaction:string;organization_id:string;owner_id:string|null;created_by:string|null;assigned_user:string|null}){
 const reviewer=actor.roles.some(role=>['admin','moderator'].includes(role));
 const author=row.owner_id===actor.id||row.organization_id===actor.orgId&&row.assigned_user===actor.id;
 const manager=actor.roles.includes('admin')||row.organization_id===actor.orgId&&actor.roles.includes('agency_manager');
 const editable=author||manager;
 return {can_edit:editable&&['draft','rejected','published'].includes(row.status),can_media:editable||reviewer,allowed_transitions:editable||reviewer?(listingTransitions[row.status]||[]).filter(status=>status!=='sold'||row.transaction==='sale').filter(status=>status!=='leased'||row.transaction==='rent').filter(status=>!['under_review','published','rejected'].includes(status)||reviewer&&(!['published','rejected'].includes(status)||!author&&row.created_by!==actor.id)):[]};
}
