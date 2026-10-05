import {Controller,Get,Inject,Req} from '@nestjs/common';
import {listingSearchSchemaVersion} from '@haven/contracts';
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
  const search=await transaction(actor,async c=>{
   const row=(await c.query(`SELECT count(*) FILTER(WHERE (p.id IS NOT NULL AND (v.aggregate_id IS NULL OR v.source_version<>l.version OR v.tombstone)) OR (p.id IS NULL AND v.aggregate_id IS NOT NULL AND NOT v.tombstone))::int AS stale,
    coalesce(max(extract(epoch FROM now()-l.updated_at)) FILTER(WHERE (p.id IS NOT NULL AND (v.aggregate_id IS NULL OR v.source_version<>l.version OR v.tombstone)) OR (p.id IS NULL AND v.aggregate_id IS NOT NULL AND NOT v.tombstone)),0)::float8 AS oldest
    FROM listings l LEFT JOIN public_listings p ON p.id=l.id LEFT JOIN projection_versions v ON v.aggregate_id=l.id AND v.projection='listings'`)).rows[0];
   const pending=(await c.query("SELECT count(*)::int AS count,coalesce(max(extract(epoch FROM now()-created_at)),0)::float8 AS age FROM outbox WHERE processed_at IS NULL AND (kind LIKE 'listing.%' OR kind LIKE 'property.%')")).rows[0];
   return {staleListings:row.stale,oldestStaleSeconds:Math.max(0,row.oldest),pendingEvents:pending.count,oldestPendingSeconds:Math.max(0,pending.age),providerAvailable:false,indexedDocuments:null as number|null,schemaVersion:listingSearchSchemaVersion};
  });
  try{const response=await fetch(env.SEARCH_URL+'/indexes/listings/stats',{headers:{Authorization:'Bearer '+env.SEARCH_KEY},signal:AbortSignal.timeout(1200)});if(response.ok){const stats=await response.json() as {numberOfDocuments:number};if(Number.isSafeInteger(stats.numberOfDocuments)&&stats.numberOfDocuments>=0){search.providerAvailable=true;search.indexedDocuments=stats.numberOfDocuments;}}}catch{/* Provider unavailability is explicit; no fabricated zero count. */}
  let queue:Record<string,number>|null=null;
  try{const response=await fetch('http://worker:9001/metrics',{headers:{Authorization:'Bearer '+env.SESSION_KEY},signal:AbortSignal.timeout(2000)});if(response.ok)queue=await response.json() as Record<string,number>;}catch{/* An unavailable queue remains an explicit null metric. */}
  return data({requests:requestMetrics(),outbox,queue,search});
 }
}
