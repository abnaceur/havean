import {providerDestination} from './provider-catalog.js';
import {Controller,Get,Post,Patch,Param,Req,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {event} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
@Controller('api/v1')
export class ServicesController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('quote-requests') async quote(@Req() req:FastifyRequest,@Body() body:unknown){const a=await this.identity.actor(req);const x=z.object({providerId:z.string().uuid(),description:z.string().min(10).max(3000),budget:z.string().regex(/^\d+(\.\d{1,2})?$/)}).parse(body);return transaction(a,async c=>idempotent(c,a,req,x,async()=>{const p=await providerDestination(c,x.providerId);if(!p)fail(404,'Provider not found');const r=await c.query('INSERT INTO quotes(provider_id,user_id,organization_id,description,budget) VALUES($1,$2,$3,$4,$5) RETURNING id,status',[x.providerId,a.id,p.organization_id,x.description,x.budget]);await event(c,a,r.rows[0].id,'quote.requested');return data(r.rows[0]);}));}
 @Get('ops/quotes') async quotes(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['vendor','admin']);return transaction(a,async c=>data((await c.query('SELECT * FROM quotes ORDER BY created_at DESC')).rows));}
 @Patch('ops/quotes/:id') async changeQuote(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['vendor','admin']);const x=z.object({status:z.enum(['assigned','contacted','quoted','closed']),version:z.number().int()}).parse(body);return transaction(a,async c=>{const r=(await c.query('SELECT * FROM quotes WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)fail(404,'Quote not found');if(r.version!==x.version)fail(409,'Quote has changed');const states=['requested','assigned','contacted','quoted','closed'];if(states.indexOf(x.status)!==states.indexOf(r.status)+1)fail(409,'Invalid quote transition');await c.query('UPDATE quotes SET status=$2,version=version+1 WHERE id=$1',[id,x.status]);await event(c,a,id,'quote.'+x.status);return data({id,status:x.status,version:r.version+1});});}
}
