import {Controller,Get,Post,Patch,Req,Param,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {analyticsConsent,viewSignal} from '@haven/contracts';
import {event} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
@Controller('api/v1')
export class DiscoveryEventsController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('me/analytics-consent') async consent(@Req() req:FastifyRequest){const a=await this.identity.actor(req);return transaction(a,async c=>{if(!(await c.query("SELECT 1 FROM profiles WHERE id=actor_id() AND state='active'")).rowCount)fail(403,'Active account required');const r=(await c.query('SELECT enabled,version FROM analytics_consent WHERE user_id=actor_id()')).rows[0];return data(r||{enabled:false,version:0});});}
 @Patch('me/analytics-consent') async changeConsent(@Req() req:FastifyRequest,@Body() body:unknown){const a=await this.identity.actor(req),x=analyticsConsent.parse(body);return transaction(a,async c=>{if(!(await c.query("SELECT 1 FROM profiles WHERE id=actor_id() AND state='active' FOR SHARE")).rowCount)fail(403,'Active account required');return idempotent(c,a,req,x,async()=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['analytics-consent:'+a.id]);const current=(await c.query('SELECT enabled,version FROM analytics_consent WHERE user_id=actor_id() FOR UPDATE')).rows[0]||{enabled:false,version:0};if(current.version!==x.version)fail(409,'Consent changed; refresh before updating');if(current.enabled===x.enabled)fail(409,'Choose a changed consent state');const r=(await c.query('INSERT INTO analytics_consent(user_id,enabled,version) VALUES($1,$2,1) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,version=analytics_consent.version+1,updated_at=statement_timestamp() RETURNING enabled,version',[a.id,x.enabled])).rows[0];await event(c,a,a.id,'analytics.consent_changed',{version:r.version});return data(r);});});}
 @Post('listings/:id/impression') async impression(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req),x=viewSignal.parse(body);z.uuid().parse(id);return transaction(a,async c=>{if(!x.consent)return data({recorded:false,counted:false});if(!(await c.query('SELECT 1 FROM analytics_consent WHERE user_id=actor_id() AND enabled FOR SHARE')).rowCount)fail(403,'Current analytics opt-in required');const r=(await c.query('SELECT version FROM public_listings WHERE id=$1',[id])).rows[0];if(!r)fail(404,'Property unavailable');if(r.version!==x.version)fail(409,'Property changed');return idempotent(c,a,req,x,async()=>{await event(c,a,id,'discovery.listing_impression',{eventId:x.eventId,listingVersion:x.version});return data({recorded:true,counted:true});});});}
 @Post('listings/:id/view') async view(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.identity.actor(req),input=viewSignal.parse(body);z.uuid().parse(id);
  if(!input.consent)return data({recorded:false,counted:false});
  return transaction(actor,async c=>{
   const preference=(await c.query('SELECT enabled FROM analytics_consent WHERE user_id=actor_id() FOR SHARE')).rows[0];if(preference&&!preference.enabled)fail(403,'Optional activity consent was withdrawn');
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
