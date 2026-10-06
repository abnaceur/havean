import {Controller,Get,Req,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {dashboardInventorySource} from '../inventory/dashboard-source.js';
import {dashboardNewLeadsSource,dashboardUpcomingSource} from '../engagement/dashboard-source.js';
import {Identity,data,fail,transaction} from '../platform/core.js';
@Controller('api/v1')
export class AgentDashboardController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/agent-dashboard') async overview(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agent','agency_manager','admin']);return transaction(a,async c=>{
  const row=(await c.query(`WITH authority AS (SELECT bool_or(m.role='agency_manager') AS team FROM memberships m JOIN organizations o ON o.id=m.organization_id AND o.type='agency' JOIN profiles p ON p.id=m.user_id AND p.state='active' WHERE m.user_id=$2 AND m.organization_id=$1 AND m.status='active' AND m.role IN('agent','agency_manager') HAVING count(*)>0),inventory AS (${dashboardInventorySource}),new_leads AS (${dashboardNewLeadsSource}),upcoming AS (${dashboardUpcomingSource})
   SELECT auth.team,statement_timestamp() AS as_of,jsonb_build_object('inventory',(SELECT count(*)::int FROM inventory),'published',(SELECT count(*)::int FROM inventory WHERE status='published'),'newLeads',(SELECT count(*)::int FROM new_leads),'upcoming',(SELECT count(*)::int FROM upcoming)) AS counts,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'status',i.status,'currency',i.currency,'price',i.price,'version',i.version) ORDER BY i.updated_at DESC,i.id),'[]'::jsonb) FROM (SELECT * FROM inventory ORDER BY updated_at DESC,id LIMIT 5) i) inventory,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'status',l.status,'createdAt',l.created_at,'version',l.version) ORDER BY l.created_at DESC,l.id),'[]'::jsonb) FROM (SELECT * FROM new_leads ORDER BY created_at DESC,id LIMIT 5) l) new_leads,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'startAt',v.start_at,'endAt',v.end_at,'status',v.status,'version',v.version) ORDER BY v.start_at,v.id),'[]'::jsonb) FROM (SELECT * FROM upcoming ORDER BY start_at,id LIMIT 5) v) upcoming FROM authority auth`,[a.orgId,a.id])).rows[0];if(!row)fail(403,'An active agent or manager membership in the selected agency is required');return data({organizationId:a.orgId,scope:row.team?'agency':'assigned',asOf:new Date(row.as_of).toISOString(),counts:row.counts,inventory:row.inventory,newLeads:row.new_leads,upcoming:row.upcoming,definitions:{inventory:'Current permitted listings excluding sold, leased and archived records.',published:'Published records within the same inventory scope.',newLeads:'Permitted inquiries whose current CRM status is new.',upcoming:'Future requested or confirmed appointments for this scope; existing bookings keep their booked agent.'}});
 });}
}
