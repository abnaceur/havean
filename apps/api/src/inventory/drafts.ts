import {Controller,Get,Post,Patch,Req,Param,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {draftCreate,draftUpdate} from '@haven/contracts';
import {event,type Actor} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
const fields=`l.id,l.unit_id,l.organization_id,l.owner_id,l.agent_id,l.title,l.description,l.transaction,l.segment,l.currency,l.price::text,l.rent_period,l.furnishing,l.available_from,l.features,l.status,l.version,l.slug`;
async function scoped(c:pg.PoolClient,a:Actor,id:string,lock=false){
 const row=(await c.query(`SELECT ${fields} FROM listings l WHERE l.id=$1 AND (l.owner_id=$2 OR $3 OR (l.organization_id=$4 AND ($5 OR l.agent_id IN(SELECT id FROM agents WHERE user_id=$2))))${lock?' FOR UPDATE OF l':''}`,[id,a.id,a.roles.includes('admin'),a.orgId,a.roles.includes('agency_manager')])).rows[0];if(!row)fail(404,'Assigned property not found');return row;
}
@Controller('api/v1')
export class DraftInventoryController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/listing-units') async units(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['owner','agent','agency_manager','admin']);return transaction(a,async c=>data((await c.query(`SELECT u.id,u.area::text,u.beds,u.floor,co.name AS community FROM units u JOIN communities co ON co.id=u.community_id WHERE $3 OR ($4 AND (u.organization_id=$2 OR u.id IN(SELECT unit_id FROM listing_mandates WHERE organization_id=$2 AND status='active' AND starts_at<=now() AND expires_at>now()))) OR u.id IN(SELECT unit_id FROM listings WHERE owner_id=$1) ORDER BY co.name,u.id LIMIT 200`,[a.id,a.orgId,a.roles.includes('admin'),a.roles.some(r=>['agent','agency_manager'].includes(r))])).rows));}
 @Get('me/listing-drafts') async owned(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['owner','admin']);return transaction(a,async c=>data((await c.query(`SELECT ${fields} FROM listings l WHERE l.owner_id=$1 AND l.status IN ('draft','rejected') ORDER BY l.updated_at DESC`,[a.id])).rows));}
 @Get('ops/listings/:id/draft') async read(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['owner','agent','agency_manager','admin']);return transaction(a,async c=>{const row=await scoped(c,a,id);if(!['draft','rejected'].includes(row.status))fail(409,'This property is not an editable draft');return data(row);});}
 @Post('ops/listings') async create(@Req() req:FastifyRequest,@Body() body:unknown){const a=await this.identity.actor(req,['owner','agent','agency_manager','admin']),x=draftCreate.parse(body);return transaction(a,async c=>idempotent(c,a,req,x,async()=>{
  const staff=a.roles.some(role=>['agent','agency_manager','admin'].includes(role));if(x.unit&&!staff)fail(403,'New owner properties require ownership review');if(!a.orgId&&x.unit)fail(400,'Select an organization before creating a unit');
  let unit:any;
  if(x.unit){const u=x.unit;const city=(await c.query("SELECT ci.currency FROM communities co JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE co.id=$1 AND co.status='active' AND d.status='active' AND ci.status='active'",[u.communityId])).rows[0];if(!city)fail(400,'Choose an active community');if(city.currency!==x.currency)fail(400,'Use the property market currency');unit=(await c.query('INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths,orientation,floor) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,organization_id',[u.communityId,a.orgId,u.area,u.beds,u.livingRooms,u.baths,u.orientation,u.floor])).rows[0];}
  else{unit=(await c.query(`SELECT u.id,u.organization_id,ci.currency FROM units u JOIN communities co ON co.id=u.community_id JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE u.id=$1 AND ($3 OR ($4 AND (u.organization_id=$2 OR u.id IN(SELECT unit_id FROM listing_mandates WHERE organization_id=$2 AND status='active' AND starts_at<=now() AND expires_at>now()))) OR u.id IN(SELECT unit_id FROM listings WHERE owner_id=$5))${staff?' FOR SHARE OF u':''}`,[x.unitId,a.orgId,a.roles.includes('admin'),staff,a.id])).rows[0];if(!unit)fail(404,'Permitted unit not found');if(unit.currency!==x.currency)fail(400,'Use the property market currency');}
  const organizationId=staff&&!a.roles.includes('admin')?a.orgId:unit.organization_id;
  const agent=(await c.query('SELECT id FROM agents WHERE organization_id=$1 AND ($2 OR user_id=$3) ORDER BY id LIMIT 1',[organizationId,!a.roles.includes('agent'),a.id])).rows[0];
  if(staff&&!agent&&!a.roles.includes('admin'))fail(409,'A responsible agency agent is required');
  const row=(await c.query(`INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,rent_period,furnishing,available_from,features,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,[unit.id,organizationId,staff?null:a.id,agent?.id||null,'property-'+crypto.randomUUID(),x.title,x.description,x.transaction,x.segment,x.currency,x.price,x.rentPeriod,x.furnishing,x.availableFrom,x.features,a.id])).rows[0];
  if(x.unit)await c.query('INSERT INTO unit_private_details(unit_id,organization_id,private_address) VALUES($1,$2,$3)',[unit.id,organizationId,x.unit.privateAddress]);
  if(x.segment==='residential')await c.query('INSERT INTO residential_details(listing_id) VALUES($1)',[row.id]);else await c.query('INSERT INTO commercial_details(listing_id) VALUES($1)',[row.id]);
  if(x.transaction==='rent')await c.query('INSERT INTO rental_terms(listing_id,currency,billing_period) VALUES($1,$2,$3)',[row.id,x.currency,x.rentPeriod]);
  await event(c,a,row.id,'listing.drafted');return data(await scoped(c,a,row.id));
 }));}
 @Patch('ops/listings/:id/draft') async update(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['owner','agent','agency_manager','admin']),x=draftUpdate.parse(body);return transaction(a,async c=>{
  const row=await scoped(c,a,id,true);if(row.version!==x.version)fail(409,'This draft changed; reload before editing');if(!['draft','rejected'].includes(row.status))fail(409,'Only drafts or rejected listings can be edited');if(row.transaction!==x.transaction||row.segment!==x.segment||row.currency!==x.currency)fail(400,'Transaction, segment and currency are fixed for this draft');
  await c.query('UPDATE listings SET title=$2,description=$3,price=$4,rent_period=$5,furnishing=$6,available_from=$7,features=$8,version=version+1,updated_at=now() WHERE id=$1',[id,x.title,x.description,x.price,x.rentPeriod,x.furnishing,x.availableFrom,x.features]);
  if(row.transaction==='rent')await c.query('UPDATE rental_terms SET billing_period=$2,version=version+1 WHERE listing_id=$1',[id,x.rentPeriod]);
  await event(c,a,id,'listing.draft_edited');return data(await scoped(c,a,id));
 });}
}
