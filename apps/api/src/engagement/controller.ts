import {viewingCalendar} from './viewing-calendar.js';
import {reserveViewing,confirmViewing,cancelOwnViewing} from './viewing-bookings.js';
import {changeLeadStage,crmAuthority} from './crm.js';
import {submitAccountInquiry} from './inquiries.js';
import {Controller,Get,Post,Put,Delete,Patch,Param,Req,Body,Query,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {favoriteMutation,inquirySchema,leadStageUpdate,viewingBookingCreate,viewingBookingConfirm,viewingBookingCancel,viewingCalendarQuery} from '@haven/contracts';
import {event} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
@Controller('api/v1')
export class EngagementController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('me/favorites') async favorites(@Req() req:FastifyRequest){const a=await this.identity.actor(req);return transaction(a,async c=>data((await c.query('SELECT CASE WHEN p.id IS NULL THEN jsonb_build_object(\'id\',f.listing_id,\'available\',false,\'title\',\'Saved property is unavailable\') ELSE to_jsonb(p)||jsonb_build_object(\'available\',true) END AS listing FROM favorites f LEFT JOIN public_listings p ON p.id=f.listing_id WHERE f.user_id=$1 AND f.saved ORDER BY f.created_at DESC',[a.id] )).rows.map(row=>row.listing)));}
 @Get('me/favorites/:id') async favoriteState(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req);z.string().uuid().parse(id);return transaction(a,async c=>{const current=(await c.query('SELECT saved,version FROM favorites WHERE user_id=$1 AND listing_id=$2',[a.id,id])).rows[0],listing=(await c.query('SELECT version FROM public_listings WHERE id=$1',[id])).rows[0];return data({saved:current?.saved??false,version:current?.version??0,listingVersion:listing?.version??null});});}
 @Put('me/favorites/:id') async favorite(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req);z.string().uuid().parse(id);const input=favoriteMutation.parse(body);return this.toggleFavorite(a,req,id,input,true);}
 @Delete('me/favorites/:id') async unfavorite(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req);z.string().uuid().parse(id);const input=favoriteMutation.parse(body);return this.toggleFavorite(a,req,id,input,false);}
 private async toggleFavorite(a:import('@haven/database').Actor,req:FastifyRequest,id:string,input:import('zod').infer<typeof favoriteMutation>,saved:boolean){return transaction(a,c=>idempotent(c,a,req,input,async()=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['favorite:'+a.id+':'+id]);
  const current=(await c.query('SELECT saved,version FROM favorites WHERE user_id=$1 AND listing_id=$2 FOR UPDATE',[a.id,id])).rows[0],listing=(await c.query('SELECT version FROM public_listings WHERE id=$1',[id])).rows[0];
  if((current?.version??0)!==input.version)fail(409,'Saved homes changed. Refresh and try again.','FAVORITE_CHANGED');
  if(saved&&!listing)fail(404,'Property is unavailable');if(saved&&listing.version!==input.listingVersion)fail(409,'Property changed. Refresh and try again.','LISTING_CHANGED');
  if((current?.saved??false)===saved)return data({saved,version:current?.version??0,listingVersion:listing?.version??null});
  const row=(await c.query('INSERT INTO favorites(user_id,listing_id,saved) VALUES($1,$2,$3) ON CONFLICT(user_id,listing_id) DO UPDATE SET saved=EXCLUDED.saved,version=favorites.version+1,created_at=CASE WHEN EXCLUDED.saved THEN now() ELSE favorites.created_at END RETURNING version',[a.id,id,saved])).rows[0];
  await event(c,a,id,saved?'favorite.saved':'favorite.removed',{userId:a.id,version:row.version});return data({saved,version:row.version,listingVersion:listing?.version??null});
 }));}
 @Post('inquiries') async inquiry(@Req() req:FastifyRequest,@Body() body:unknown){const a=await this.identity.actor(req),x=inquirySchema.parse(body);return submitAccountInquiry(a,req,x);}
 @Get('me/inquiries') async inquiries(@Req() req:FastifyRequest){const a=await this.identity.actor(req);return transaction(a,async c=>data((await c.query('SELECT id,resource_id,status,created_at,message FROM leads WHERE user_id=$1 ORDER BY created_at DESC',[a.id])).rows));}
 @Get('ops/leads') async leads(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agent','agency_manager','developer','vendor','admin']);return transaction(a,async c=>{const auth=await crmAuthority(c,a);return data((await c.query('SELECT l.* FROM leads l WHERE l.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM agents ag WHERE ag.id=l.agent_id AND ag.user_id=$3 AND ag.organization_id=$1)) ORDER BY l.created_at DESC,l.id LIMIT 200',[a.orgId,auth.team,a.id])).rows);});}
 @Patch('ops/leads/:id') async lead(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager','developer','vendor','admin']),x=leadStageUpdate.parse(body);return changeLeadStage(a,req,id,x);}
 @Get('me/viewings') async viewings(@Req() req:FastifyRequest,@Query() input:unknown){const a=await this.identity.actor(req),x=viewingCalendarQuery.parse(input);return viewingCalendar(a,x,false);}
 @Get('ops/viewings') async opsViewings(@Req() req:FastifyRequest,@Query() input:unknown){const a=await this.identity.actor(req,['agent','agency_manager','admin']),x=viewingCalendarQuery.parse(input);return viewingCalendar(a,x,true);}
 @Post('viewings') async book(@Req() req:FastifyRequest,@Body() body:unknown){const a=await this.identity.actor(req),x=viewingBookingCreate.parse(body);return reserveViewing(a,req,x);}
 @Post('viewings/:id/cancel') async cancel(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req),x=viewingBookingCancel.parse(body);z.uuid().parse(id);return cancelOwnViewing(a,req,id,x);}
 @Post('ops/viewings/:id/confirm') async confirm(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager','admin']),x=viewingBookingConfirm.parse(body);z.uuid().parse(id);return confirmViewing(a,req,id,x);}
 @Get('conversations') async conversations(@Req() req:FastifyRequest){const a=await this.identity.actor(req);return transaction(a,async c=>data((await c.query('SELECT id,resource_id,created_at FROM conversations ORDER BY created_at DESC')).rows));}
 @Get('conversations/:id/messages') async messages(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req);return transaction(a,async c=>{if(!(await c.query('SELECT 1 FROM conversations WHERE id=$1',[id])).rowCount)fail(404,'Conversation not found');return data((await c.query('SELECT id,sender_id,sequence,body,created_at FROM messages WHERE conversation_id=$1 ORDER BY sequence LIMIT 500',[id])).rows);});}
 @Post('conversations/:id/messages') async message(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req);const x=z.object({body:z.string().trim().min(1).max(4000),clientId:z.string().uuid()}).parse(body);return transaction(a,async c=>{if(!(await c.query('SELECT 1 FROM conversations WHERE id=$1 FOR UPDATE',[id])).rowCount)fail(404,'Conversation not found');const r=await c.query('INSERT INTO messages(conversation_id,sender_id,client_id,sequence,body) VALUES($1,$2,$3,(SELECT coalesce(max(sequence),0)+1 FROM messages WHERE conversation_id=$1),$4) ON CONFLICT(sender_id,client_id) DO UPDATE SET client_id=EXCLUDED.client_id RETURNING id,sender_id,sequence,body,created_at',[id,a.id,x.clientId,x.body]);await event(c,a,id,'message.persisted');return data(r.rows[0]);});}
}
