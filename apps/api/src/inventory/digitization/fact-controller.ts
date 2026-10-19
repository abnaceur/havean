import {Body,Controller,Get,Inject,Param,Post,Req} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {digitizationFactDecision} from '@haven/contracts';
import {Identity,data,idempotent,transaction} from '../../platform/core.js';
import {decideFact,readFactReview} from './fact-review.js';
import {verifyUnitApplicationSources} from './inventory-source-preflight.js';
@Controller('api/v1')
export class DigitizationFactController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/digitizations/:id/facts') async read(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>data(await readFactReview(c,a,id)));}
 @Post('ops/digitizations/:id/facts/:candidateId/decisions') async decide(@Req() req:FastifyRequest,@Param('id') id:string,@Param('candidateId') candidateId:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationFactDecision.parse(body);z.uuid().parse(id);z.uuid().parse(candidateId);
  await verifyUnitApplicationSources(a,id,x.inputRevision);
  return transaction(a,c=>idempotent(c,a,req,x,async()=>data(await decideFact(c,a,id,candidateId,x))));
 }
}
