import {Controller,Get,Post,Patch,Req,Query,Body,Param,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import {boostCreate,boostUpdate} from '@haven/contracts';
import {event} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
async function eligible(c:pg.PoolClient,x:z.output<typeof boostCreate>){const query=x.resourceType==='listing'?'SELECT id FROM public_listings WHERE id=$1 AND city=$2':"SELECT de.id FROM developments de JOIN communities co ON co.id=de.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE de.id=$1 AND ci.slug=$2 AND de.status IN('on_sale','coming_soon')";if(!(await c.query(query,[x.resourceId,x.city])).rowCount)fail(400,'Choose a currently eligible property in this city','INELIGIBLE_RESOURCE');}
@Controller('api/v1')
export class RankingBoostsController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/ranking-boosts') async read(@Req() req:FastifyRequest,@Query() input:unknown){const actor=await this.identity.actor(req,['editor','admin']),q=z.strictObject({city:z.string().regex(/^[a-z0-9-]{1,50}$/).default('bj')}).parse(input);return transaction(actor,async c=>data((await c.query('SELECT * FROM curated_boosts WHERE city=$1 ORDER BY updated_at DESC,id LIMIT 100',[q.city])).rows));}
 @Post('ops/ranking-boosts') async create(@Req() req:FastifyRequest,@Body() body:unknown){const actor=await this.identity.actor(req,['editor','admin']),x=boostCreate.parse(body);return transaction(actor,async c=>idempotent(c,actor,req,x,async()=>{
  await eligible(c,x);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[x.resourceType+':'+x.resourceId]);if((await c.query('SELECT id FROM curated_boosts WHERE resource_type=$1 AND resource_id=$2',[x.resourceType,x.resourceId])).rowCount)fail(409,'This property already has curation; edit its existing record','DUPLICATE_CURATION');
  const row=(await c.query('INSERT INTO curated_boosts(resource_type,resource_id,city,points,sponsored,public_label,starts_at,ends_at,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *',[x.resourceType,x.resourceId,x.city,x.points,x.sponsored,x.publicLabel,x.startsAt,x.endsAt,x.status,actor.id])).rows[0];await event(c,actor,row.id,'discovery.curation_created',{resourceType:x.resourceType,resourceId:x.resourceId,version:row.version});return data(row);
 }));}
 @Patch('ops/ranking-boosts/:id') async update(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const actor=await this.identity.actor(req,['editor','admin']),x=boostUpdate.parse(body);z.uuid().parse(id);return transaction(actor,async c=>idempotent(c,actor,req,x,async()=>{
  const old=(await c.query('SELECT * FROM curated_boosts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)fail(404,'Curation record not found','NOT_FOUND');if(old.version!==x.version)fail(409,'This curation changed; reload and retry','VERSION_CONFLICT');if(old.resource_type!==x.resourceType||old.resource_id!==x.resourceId||old.city!==x.city)fail(400,'Curation cannot be moved to another property or city','RESOURCE_CHANGED');if(x.status==='active')await eligible(c,x);
  const row=(await c.query('UPDATE curated_boosts SET points=$2,sponsored=$3,public_label=$4,starts_at=$5,ends_at=$6,status=$7,version=version+1,updated_by=$8,updated_at=now() WHERE id=$1 RETURNING *',[id,x.points,x.sponsored,x.publicLabel,x.startsAt,x.endsAt,x.status,actor.id])).rows[0];await event(c,actor,id,'discovery.curation_updated',{resourceType:x.resourceType,resourceId:x.resourceId,version:row.version});return data(row);
 }));}
}
