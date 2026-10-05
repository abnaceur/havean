import {Controller,Get,Post,Delete,Body,Query,Req,Inject} from '@nestjs/common';
import {z} from 'zod';
import type {FastifyRequest} from 'fastify';
import {Identity,data,transaction,idempotent,fail} from '../platform/core.js';
@Controller('api/v1')
export class SearchHistoryController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('me/recent-searches') async read(@Req() req:FastifyRequest,@Query() input:unknown){const x=z.strictObject({city:z.string().regex(/^[a-z0-9-]{1,50}$/)}).parse(input),a=await this.identity.actor(req);return transaction(a,async c=>data((await c.query('SELECT id,city,query,version,updated_at FROM recent_searches WHERE user_id=$1 AND city=$2 ORDER BY updated_at DESC,id LIMIT 10',[a.id,x.city])).rows));}
 @Post('me/recent-searches') async record(@Req() req:FastifyRequest,@Body() body:unknown){const x=z.strictObject({city:z.string().regex(/^[a-z0-9-]{1,50}$/),query:z.string().trim().min(1).max(120)}).parse(body),a=await this.identity.actor(req);return transaction(a,async c=>idempotent(c,a,req,x,async()=>{
  if(!(await c.query("SELECT 1 FROM cities WHERE slug=$1 AND status='active'",[x.city])).rowCount)fail(400,'Choose an available city','INVALID_CITY');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['recent-searches:'+a.id+':'+x.city]);
  const result=(await c.query('INSERT INTO recent_searches(user_id,city,query) VALUES($1,$2,$3) ON CONFLICT(user_id,city,query) DO UPDATE SET version=recent_searches.version+1,updated_at=now() RETURNING id,city,query,version,updated_at',[a.id,x.city,x.query])).rows[0];
  await c.query('DELETE FROM recent_searches WHERE user_id=$1 AND city=$2 AND id NOT IN(SELECT id FROM recent_searches WHERE user_id=$1 AND city=$2 ORDER BY updated_at DESC,id LIMIT 10)',[a.id,x.city]);return data(result);
 }));}
 @Delete('me/recent-searches') async clear(@Req() req:FastifyRequest,@Query() input:unknown){const x=z.strictObject({city:z.string().regex(/^[a-z0-9-]{1,50}$/)}).parse(input),a=await this.identity.actor(req);return transaction(a,async c=>idempotent(c,a,req,x,async()=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['recent-searches:'+a.id+':'+x.city]);await c.query('DELETE FROM recent_searches WHERE user_id=$1 AND city=$2',[a.id,x.city]);return data({cleared:true});}));}
}
