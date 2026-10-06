import {Controller,Get,Patch,Param,Req,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import {leadAssignment} from '@haven/contracts';
import type {Actor} from '@haven/database';
import {requireAgencyManager} from '../identity/agency-memberships.js';
import {requireAssignmentAgent} from '../services/assignment-agents.js';
import {recordAssignmentEvent} from './assignment-events.js';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
const terminal=['won','converted','lost','closed'];
export async function assignLead(c:pg.PoolClient,a:Actor,id:string,x:z.infer<typeof leadAssignment>){await requireAgencyManager(c,a);const l=(await c.query('SELECT * FROM leads WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,a.orgId])).rows[0];if(!l)fail(404,'Agency lead not found');if(l.version!==x.version)fail(409,'Lead changed; refresh before assigning');if(terminal.includes(l.status))fail(409,'Closed leads cannot be reassigned');if(l.agent_id===x.agentId)fail(409,'Lead is already assigned to this agent');await requireAssignmentAgent(c,a.orgId!,x.agentId);if(l.conversation_id)await c.query('SELECT id FROM conversations WHERE id=$1 AND organization_id=$2 FOR UPDATE',[l.conversation_id,a.orgId]);const r=(await c.query('UPDATE leads SET agent_id=$2,version=version+1 WHERE id=$1 RETURNING id,version',[id,x.agentId])).rows[0];await c.query('INSERT INTO lead_assignment_history(lead_id,organization_id,actor_id,previous_agent_id,agent_id,version,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,a.orgId,a.id,l.agent_id,x.agentId,r.version,x.reason]);await recordAssignmentEvent(c,a,'lead',id,{version:r.version,agentId:x.agentId});return {...r,agentId:x.agentId,movedLeads:0};}
export async function moveOpenListingLeads(c:pg.PoolClient,a:Actor,listingId:string,agentId:string,reason:string){const rows=(await c.query("SELECT id,version FROM leads WHERE resource_type='listing' AND resource_id=$1 AND organization_id=$2 AND status<>ALL($3::text[]) AND agent_id IS DISTINCT FROM $4 ORDER BY id FOR UPDATE",[listingId,a.orgId,terminal,agentId])).rows;for(const l of rows)await assignLead(c,a,l.id,{agentId,version:l.version,reason});return rows.length;}
@Controller('api/v1')
export class LeadAssignmentsController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/assignment-leads') async leads(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agency_manager','admin']);return transaction(a,async c=>{await requireAgencyManager(c,a);return data((await c.query('SELECT id,name,status,agent_id,version FROM leads WHERE organization_id=$1 ORDER BY created_at DESC,id LIMIT 200',[a.orgId])).rows);});}
 @Patch('ops/leads/:id/assignment') async assign(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agency_manager','admin']),x=leadAssignment.parse(body);z.uuid().parse(id);return transaction(a,c=>idempotent(c,a,req,x,async()=>data(await assignLead(c,a,id,x))));}
 @Get('ops/lead-assignment-history') async history(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agency_manager','admin']);return transaction(a,async c=>{await requireAgencyManager(c,a);return data((await c.query('SELECT * FROM lead_assignment_history WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[a.orgId])).rows);});}
}
