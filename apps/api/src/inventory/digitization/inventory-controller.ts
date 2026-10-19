import {digitizationDraftCreate} from '@haven/contracts';
import {createIntakeInventoryDraft} from './intake-draft.js';
import {Body,Controller,Get,Inject,Param,Post,Req} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {digitizationUnitApplicationCreate} from '@haven/contracts';
import {Identity,data,idempotent,transaction} from '../../platform/core.js';
import {submitDigitizationUnitApplication,readUnitApplicationContext} from './inventory-application.js';
import {verifyUnitApplicationSources} from './inventory-source-preflight.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
@Controller('api/v1')
export class DigitizationInventoryController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/digitizations/:id/inventory-applications') async unitContext(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>data(await readUnitApplicationContext(c,a,id)));}
 @Post('ops/digitizations/:id/inventory-draft') async createDraft(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationDraftCreate.parse(body);z.uuid().parse(id);
  await verifyUnitApplicationSources(a,id,x.inputRevision);
  return transaction(a,c=>idempotent(c,a,req,x,async()=>data(await createIntakeInventoryDraft(c,a,id,x))));
 }
 @Post('ops/digitizations/:id/inventory-applications') async proposeUnit(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationUnitApplicationCreate.parse(body);z.uuid().parse(id);
  const previous=await transaction(a,async c=>{await requireDigitizationAgency(c,a);await checkedWorkspace(c,id);if((await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,req.headers['idempotency-key']])).rowCount)return idempotent(c,a,req,x,async()=>{throw new Error('Missing inventory application receipt');});return null;});
  if(previous)return previous;
  await verifyUnitApplicationSources(a,id,x.inputRevision);
  return transaction(a,c=>idempotent(c,a,req,x,async()=>data(await submitDigitizationUnitApplication(c,a,id,x))));
 }
}
