import {Body,Controller,Get,Inject,Param,Post,Req} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {digitizationTourCreate} from '@haven/contracts';
import {Identity,data,idempotent,transaction} from '../../platform/core.js';
import {latestTour,saveTour,tourScope,verifyTourSources,panoramaCandidates} from './tours.js';
@Controller('api/v1')
export class DigitizationTourController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('ops/digitizations/:id/tour-revisions') async save(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),input=digitizationTourCreate.parse(body);z.uuid().parse(id);
  const prior=await transaction(a,async c=>{await tourScope(c,a,id,input);if((await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,req.headers['idempotency-key']])).rowCount)return idempotent(c,a,req,input,async()=>{throw Error('Missing tour receipt');});return null;});if(prior)return prior;
  const prepared=await verifyTourSources(a,id,input);return transaction(a,async c=>{await tourScope(c,a,id,input);return idempotent(c,a,req,input,async()=>data(await saveTour(c,a,id,input,prepared)));});
 }
 @Get('ops/digitizations/:id/tour-revisions/latest') async latest(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,c=>latestTour(c,a,id).then(data));}
 @Get('ops/digitizations/:id/panorama-candidates') async candidates(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,c=>panoramaCandidates(c,a,id).then(data));}
}
