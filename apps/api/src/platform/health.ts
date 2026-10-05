import {Controller,Get,Inject,Req} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {Identity,env,pool,transaction,data,fail} from './core.js';
import {checkReadiness,requestMetrics} from './observability.js';
@Controller('api/v1/health')
export class HealthController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('live') live(){return data({status:'up'});}
 @Get('ready') async ready(){const result=await checkReadiness(pool);if(result.status!=='ready')fail(503,'Required database or migrations are unavailable','NOT_READY');return data(result);}
 @Get('metrics') async metrics(@Req() req:FastifyRequest){
  const actor=await this.identity.actor(req,['admin']);
  const outbox=await transaction(actor,async c=>{
   const row=(await c.query("SELECT count(*) FILTER(WHERE processed_at IS NULL)::int AS pending,count(*) FILTER(WHERE processed_at IS NOT NULL)::int AS processed,coalesce(max(extract(epoch FROM now()-created_at)) FILTER(WHERE processed_at IS NULL),0)::float8 AS oldest_pending_seconds,coalesce(sum(attempts),0)::int AS dispatch_attempts FROM outbox")).rows[0];
   return {pending:row.pending,processed:row.processed,oldestPendingSeconds:Math.max(0,row.oldest_pending_seconds),dispatchAttempts:row.dispatch_attempts};
  });
  let queue:Record<string,number>|null=null;
  try{const response=await fetch('http://worker:9001/metrics',{headers:{Authorization:'Bearer '+env.SESSION_KEY},signal:AbortSignal.timeout(2000)});if(response.ok)queue=await response.json() as Record<string,number>;}catch{/* An unavailable queue remains an explicit null metric. */}
  return data({requests:requestMetrics(),outbox,queue});
 }
}
