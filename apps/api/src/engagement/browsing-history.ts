import {Controller,Get,Patch,Post,Delete,Req,Param,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import {historyVersion,historyPreference,historyView} from '@haven/contracts';
import {event,type Actor} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
async function collection(c:pg.PoolClient,actor:Actor){
 const settings=(await c.query('SELECT enabled,version FROM browsing_history_settings WHERE user_id=$1',[actor.id])).rows[0];
 const entries=(await c.query(`SELECT h.viewed_at AS "viewedAt",CASE WHEN p.id IS NULL THEN jsonb_build_object('id',h.listing_id,'available',false,'title','Previously viewed property is unavailable') ELSE to_jsonb(p)||jsonb_build_object('available',true) END AS listing FROM browsing_history h LEFT JOIN public_listings p ON p.id=h.listing_id WHERE h.user_id=$1 ORDER BY h.viewed_at DESC,h.listing_id LIMIT 100`,[actor.id])).rows.map(row=>({...row,viewedAt:new Date(row.viewedAt).toISOString()}));
 return data({enabled:settings?.enabled??false,version:settings?.version??0,entries});
}
async function locked(c:pg.PoolClient,actor:Actor,version:number){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['browsing-history:'+actor.id]);const settings=(await c.query('SELECT enabled,version FROM browsing_history_settings WHERE user_id=$1 FOR UPDATE',[actor.id])).rows[0];if((settings?.version??0)!==version)fail(409,'Browsing history changed. Refresh and try again.','HISTORY_CHANGED');return settings;
}
@Controller('api/v1')
export class BrowsingHistoryController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('me/history') async read(@Req() req:FastifyRequest){const actor=await this.identity.actor(req);return transaction(actor,c=>collection(c,actor));}
 @Patch('me/history/preferences') async preferences(@Req() req:FastifyRequest,@Body() body:unknown){const actor=await this.identity.actor(req),input=historyPreference.parse(body);return transaction(actor,c=>idempotent(c,actor,req,input,async()=>{const current=await locked(c,actor,input.version);if((current?.enabled??false)!==input.enabled){await c.query('INSERT INTO browsing_history_settings(user_id,enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,version=browsing_history_settings.version+1',[actor.id,input.enabled]);await event(c,actor,actor.id,'account.history_preference_changed',{enabled:input.enabled,version:input.version+1});}return collection(c,actor);}));}
 @Post('me/history/:id') async record(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const actor=await this.identity.actor(req),input=historyView.parse(body);z.uuid().parse(id);return transaction(actor,c=>idempotent(c,actor,req,input,async()=>{
  const settings=await locked(c,actor,input.version);if(!settings?.enabled)fail(403,'Enable browsing history before recording a visit.','HISTORY_CONSENT_REQUIRED');const listing=(await c.query('SELECT version FROM public_listings WHERE id=$1',[id])).rows[0];if(!listing)fail(404,'Property is unavailable');if(listing.version!==input.listingVersion)fail(409,'Property changed. Reload before recording a visit.','LISTING_CHANGED');
  await c.query('INSERT INTO browsing_history(user_id,listing_id) VALUES($1,$2) ON CONFLICT(user_id,listing_id) DO UPDATE SET viewed_at=now()',[actor.id,id]);await c.query('DELETE FROM browsing_history WHERE user_id=$1 AND listing_id IN(SELECT listing_id FROM browsing_history WHERE user_id=$1 ORDER BY viewed_at DESC,listing_id OFFSET 100)',[actor.id]);await c.query('UPDATE browsing_history_settings SET version=version+1 WHERE user_id=$1',[actor.id]);await event(c,actor,actor.id,'account.history_viewed',{listingId:id,version:input.version+1});return collection(c,actor);
 }));}
 @Delete('me/history/:id') async remove(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const actor=await this.identity.actor(req),input=historyVersion.parse(body);z.uuid().parse(id);return transaction(actor,c=>idempotent(c,actor,req,input,async()=>{await locked(c,actor,input.version);const removed=await c.query('DELETE FROM browsing_history WHERE user_id=$1 AND listing_id=$2',[actor.id,id]);if(removed.rowCount){await c.query('UPDATE browsing_history_settings SET version=version+1 WHERE user_id=$1',[actor.id]);await event(c,actor,actor.id,'account.history_removed',{listingId:id,version:input.version+1});}return collection(c,actor);}));}
 @Delete('me/history') async clear(@Req() req:FastifyRequest,@Body() body:unknown){const actor=await this.identity.actor(req),input=historyVersion.parse(body);return transaction(actor,c=>idempotent(c,actor,req,input,async()=>{await locked(c,actor,input.version);const removed=await c.query('DELETE FROM browsing_history WHERE user_id=$1',[actor.id]);if(removed.rowCount){await c.query('UPDATE browsing_history_settings SET version=version+1 WHERE user_id=$1',[actor.id]);await event(c,actor,actor.id,'account.history_cleared',{version:input.version+1});}return collection(c,actor);}));}
}
