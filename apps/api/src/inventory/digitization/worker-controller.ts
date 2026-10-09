import {Body,Controller,HttpCode,Param,Post,Req} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {validDigitizationWorker} from '@haven/config';
import {digitizationCleanupCommand,digitizationStageLease,digitizationStageExecution,digitizationStagePreparation,digitizationRunDispatch,digitizationOutboxDelivery,digitizationCancellationHandoff,digitizationGpuLease,digitizationGpuLeaseRenewal} from '@haven/contracts';
import {reclaimExpiredCapture} from './cleanup.js';
import {data,fail,pool,transaction,env} from '../../platform/core.js';
import {acquireGpuLease,renewGpuLease,releaseGpuLease} from './gpu-leases.js';
import {leaseStage,renewStageLease} from './leases.js';
import {startCpuExecution,configuredCpuRunner} from './execution-start.js';
import {prepareCpuExecution} from './execution-scope.js';
import {dispatchRunGraph} from './workflow.js';
import {collectCpuRenders} from './execution-results.js';
import {consumeDigitizationEvent} from './outbox.js';
import {completeRunCancellation,requestRunCancellation} from './cancellation.js';

/** Service authentication grants only these guarded execution commands. Current
 * initiating-actor authority is reconstructed from the database on every call;
 * the service cannot submit an admin role, arbitrary source key or publication.
 */
export function authorizeDigitizationService(req:FastifyRequest){
 const key=process.env.DIGITIZATION_COORDINATOR_KEY;
 if(!key||key===env.SESSION_KEY||!/^[a-f0-9]{64}$/.test(key))fail(503,'Digitization coordination is unavailable.','DIGITIZATION_COORDINATOR_UNAVAILABLE');
 if(!validDigitizationWorker(req.method,req.url,req.body,req.headers,key))fail(401,'Invalid processing service credential.','DIGITIZATION_SERVICE_UNAUTHORIZED');
}
export async function digitizationCommandActor(req:FastifyRequest,body:{actorId:string;organizationId:string}){
 authorizeDigitizationService(req);
 const roles=(await pool.query("SELECT DISTINCT m.role FROM memberships m JOIN profiles p ON p.id=m.user_id AND p.state='active' WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status='active' AND m.role IN('agent','agency_manager')",[body.actorId,body.organizationId])).rows.map(row=>row.role as string);
 if(!roles.length)fail(403,'The initiating actor no longer has processing authority.','DIGITIZATION_SCOPE_REQUIRED');
 return {id:body.actorId,orgId:body.organizationId,roles};
}
@Controller('api/v1')
export class DigitizationWorkerController{
 @Post('internal/digitization/maintenance/cleanup') async cleanup(@Req() req:FastifyRequest,@Body() body:unknown){digitizationCleanupCommand.parse(body);authorizeDigitizationService(req);return data(await reclaimExpiredCapture());}
 @Post('internal/digitization/stages/:id/gpu-lease') async gpuLease(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){z.uuid().parse(id);const x=digitizationGpuLease.parse(body),a=await digitizationCommandActor(req,x);return transaction(a,async c=>data(await acquireGpuLease(c,a,x.engineId,id,x.executionId,x.fencingToken)));}
 @Post('internal/digitization/stages/:id/gpu-release') async gpuRelease(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){z.uuid().parse(id);const x=digitizationGpuLeaseRenewal.parse(body),a=await digitizationCommandActor(req,x);return transaction(a,async c=>data(await releaseGpuLease(c,a,x.engineId,id,x.executionId,x.fencingToken,x.slotId,x.slotFence)));}
 @Post('internal/digitization/stages/:id/gpu-renew') async gpuRenew(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){z.uuid().parse(id);const x=digitizationGpuLeaseRenewal.parse(body),a=await digitizationCommandActor(req,x);return transaction(a,async c=>data(await renewGpuLease(c,a,x.engineId,id,x.executionId,x.fencingToken,x.slotId,x.slotFence)));}
 @Post('internal/digitization/runs/:id/cancel') async cancel(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationRunDispatch.parse(body),a=await digitizationCommandActor(req,x);
  return transaction(a,async c=>data(await requestRunCancellation(c,a,x.engineId,id,x.expectedVersion)));
 }
 @Post('internal/digitization/runs/:id/complete-cancel') async completeCancel(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationCancellationHandoff.omit({runId:true}).parse(body),a=await digitizationCommandActor(req,x),client=await configuredCpuRunner();
  return data(await completeRunCancellation(a,x.engineId,id,client));
 }
 @Post('internal/digitization/outbox/consume') async consume(@Req() req:FastifyRequest,@Body() body:unknown){
  const x=digitizationOutboxDelivery.parse(body);authorizeDigitizationService(req);
  const context=(await pool.query('SELECT * FROM digitization_outbox_context($1)',[x.eventId])).rows[0];
  if(!context)fail(404,'Engine event not found.');
  const a=await digitizationCommandActor(req,{actorId:context.actor_id,organizationId:context.organization_id});
  return transaction(a,async c=>data(await consumeDigitizationEvent(c,a,x.eventId,context.engine_id,context.run_id)));
 }
 @Post('internal/digitization/runs/:id/dispatch') async dispatch(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationRunDispatch.parse(body),a=await digitizationCommandActor(req,x);
  return transaction(a,async c=>data(await dispatchRunGraph(c,a,x.engineId,id,x.expectedVersion)));
 }
 @Post('internal/digitization/stages/:id/lease') async lease(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationStageLease.parse(body),a=await digitizationCommandActor(req,x);
  return transaction(a,async c=>data(await leaseStage(c,a,x.engineId,id,x.expectedVersion)));
 }
 @Post('internal/digitization/stages/:id/renew') async renew(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationStageExecution.parse(body),a=await digitizationCommandActor(req,x);
  return transaction(a,async c=>data(await renewStageLease(c,a,x.engineId,id,x.executionId,x.fencingToken)));
 }
 @Post('internal/digitization/stages/:id/start') @HttpCode(202) async start(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationStagePreparation.parse(body),a=await digitizationCommandActor(req,x),client=await configuredCpuRunner();
  return data(await startCpuExecution(a,x.engineId,id,x.executionId,x.fencingToken,x.assetId,client));
 }
 @Post('internal/digitization/stages/:id/collect-renders') async collect(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationStagePreparation.parse(body),a=await digitizationCommandActor(req,x),client=await configuredCpuRunner();
  return data(await collectCpuRenders(a,x.engineId,id,x.executionId,x.fencingToken,x.assetId,client));
 }
 @Post('internal/digitization/stages/:id/prepare') async prepare(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  z.uuid().parse(id);const x=digitizationStagePreparation.parse(body),a=await digitizationCommandActor(req,x);
  return transaction(a,async c=>data(await prepareCpuExecution(c,a,x.engineId,id,x.executionId,x.fencingToken,x.assetId)));
 }
}
