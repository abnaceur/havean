import {Controller,Get,Req,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import {listingAssignment} from '@haven/contracts';
import type {Actor} from '@haven/database';
import {requireAgencyManager} from '../identity/agency-memberships.js';
import {assignmentAgents,requireAssignmentAgent} from '../services/assignment-agents.js';
import {moveOpenListingLeads} from '../engagement/lead-assignments.js';
import {recordAssignmentEvent} from '../engagement/assignment-events.js';
import {Identity,data,fail,transaction} from '../platform/core.js';
export async function assignListing(c:pg.PoolClient,a:Actor,x:z.infer<typeof listingAssignment>){await requireAgencyManager(c,a);const l=(await c.query('SELECT * FROM listings WHERE id=$1 AND organization_id=$2 FOR UPDATE',[x.listingId,a.orgId])).rows[0];if(!l)fail(404,'Agency property not found');if(l.version!==x.version)fail(409,'Property changed; refresh before assigning');if(['sold','leased','archived'].includes(l.status))fail(409,'Terminal properties cannot be reassigned');if(l.agent_id===x.agentId)fail(409,'Property is already assigned to this agent');const agent=await requireAssignmentAgent(c,a.orgId!,x.agentId);const market=(await c.query('SELECT ci.slug,d.name FROM units u JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE u.id=$1',[l.unit_id])).rows[0];if(agent.city&&agent.city!==market.slug||!agent.districts.includes(market.name))fail(409,'Agent does not serve this property location');const r=(await c.query('UPDATE listings SET agent_id=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,version',[l.id,x.agentId])).rows[0];const movedLeads=x.policy==='move_open_leads'?await moveOpenListingLeads(c,a,l.id,x.agentId,x.reason):0;await c.query('INSERT INTO listing_assignment_history(listing_id,organization_id,actor_id,previous_agent_id,agent_id,version,policy,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[l.id,a.orgId,a.id,l.agent_id,x.agentId,r.version,x.policy,x.reason]);await recordAssignmentEvent(c,a,'listing',l.id,{version:r.version,agentId:x.agentId,policy:x.policy,movedLeads});return {...r,agentId:x.agentId,movedLeads};}
@Controller('api/v1')
export class AssignmentDirectoryController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/assignment-listings') async listings(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agency_manager','admin']);return transaction(a,async c=>{await requireAgencyManager(c,a);return data((await c.query('SELECT id,title,status,agent_id,version FROM listings WHERE organization_id=$1 ORDER BY updated_at DESC,id LIMIT 200',[a.orgId])).rows);});}
 @Get('ops/assignment-agents') async agents(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agency_manager','admin']);return transaction(a,async c=>{await requireAgencyManager(c,a);return data(await assignmentAgents(c,a.orgId!));});}
 @Get('ops/listing-assignment-history') async history(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agency_manager','admin']);return transaction(a,async c=>{await requireAgencyManager(c,a);return data((await c.query('SELECT * FROM listing_assignment_history WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[a.orgId])).rows);});}
}
