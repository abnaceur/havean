import {Controller,Post,Req,Param,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {viewSignal} from '@haven/contracts';
import {event} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
@Controller('api/v1')
export class DiscoveryEventsController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('listings/:id/view') async view(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.identity.actor(req),input=viewSignal.parse(body);z.uuid().parse(id);
  if(!input.consent)return data({recorded:false,counted:false});
  return transaction(actor,async c=>{
   const listing=(await c.query('SELECT version FROM public_listings WHERE id=$1',[id])).rows[0];if(!listing)fail(404,'This property is no longer available','NOT_FOUND');if(listing.version!==input.version)fail(409,'The property changed; reload before recording activity','VERSION_CONFLICT');
   return idempotent(c,actor,req,input,async()=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[input.eventId]);
    const existing=(await c.query('SELECT user_id,listing_id FROM listing_view_events WHERE id=$1',[input.eventId])).rows[0];
    if(existing){if(existing.user_id!==actor.id||existing.listing_id!==id)fail(409,'This activity event was already used','EVENT_CONFLICT');return data({recorded:true,counted:false});}
    let inserted;try{inserted=await c.query('INSERT INTO listing_view_events(id,user_id,listing_id,listing_version) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,listing_id,view_day) DO NOTHING RETURNING id',[input.eventId,actor.id,id,input.version]);}catch(error){if((error as {code?:string}).code==='23505')fail(409,'This activity event was already used','EVENT_CONFLICT');throw error;}
    if(inserted.rowCount)await event(c,actor,id,'discovery.listing_viewed',{eventId:input.eventId,listingVersion:input.version});
    return data({recorded:true,counted:!!inserted.rowCount});
   });
  });
 }
}
