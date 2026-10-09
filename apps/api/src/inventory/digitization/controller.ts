import {streamDigitizationEvents} from './events.js';
import {Body,Controller,Get,Inject,Param,Post,Req,Res} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {digitizationIntakeCreate,digitizationListingCreate,digitizationEvidenceGrantCreate,digitizationRunCancellation} from '@haven/contracts';
import {Identity,data,idempotent,transaction} from '../../platform/core.js';
import {digitizationListingAccess} from '../property-access.js';
import {checkedWorkspace,createIntake,createListingDigitization,grantOwnerEvidence,requireDigitizationAgency,workspaceColumns,workspaceRecord} from './intakes.js';
import {requestRunCancellation} from './cancellation.js';
@Controller('api/v1')
export class DigitizationController{
 @Get('ops/digitizations/:id') async workspace(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>{await requireDigitizationAgency(c,a);return data(await checkedWorkspace(c,id));});}
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('ops/digitizations/:id/runs/:runId/cancel') async cancelRun(@Req() req:FastifyRequest,@Param('id') id:string,@Param('runId') runId:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationRunCancellation.parse(body);z.uuid().parse(id);z.uuid().parse(runId);
  return transaction(a,async c=>{await requireDigitizationAgency(c,a);await checkedWorkspace(c,id);return idempotent(c,a,req,x,async()=>data(await requestRunCancellation(c,a,id,runId,x.expectedVersion)));});
 }
 @Post('ops/digitization-intakes') async create(@Req() req:FastifyRequest,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationIntakeCreate.parse(body);return transaction(a,async c=>{await requireDigitizationAgency(c,a);return idempotent(c,a,req,x,async()=>data(await createIntake(c,a)));});}
 @Get('ops/digitization-intakes') async list(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agent','agency_manager']);return transaction(a,async c=>{await requireDigitizationAgency(c,a);return data((await c.query(`SELECT ${workspaceColumns} FROM property_digitizations WHERE target_type='intake' ORDER BY created_at DESC,id LIMIT 100`)).rows.map(workspaceRecord));});}
 @Get('ops/digitization-intakes/:id') async intake(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>{await requireDigitizationAgency(c,a);return data(await checkedWorkspace(c,id,'intake'));});}
 @Post('ops/listings/:listingId/digitization') async createListing(@Req() req:FastifyRequest,@Param('listingId') listingId:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationListingCreate.parse(body);z.uuid().parse(listingId);return transaction(a,async c=>{await digitizationListingAccess(c,a,listingId);return idempotent(c,a,req,x,async()=>data(await createListingDigitization(c,a,listingId,x.listingVersion)));});}
 @Get('ops/listings/:listingId/digitization') async listing(@Req() req:FastifyRequest,@Param('listingId') listingId:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(listingId);return transaction(a,async c=>{await digitizationListingAccess(c,a,listingId);const row=(await c.query(`SELECT ${workspaceColumns} FROM property_digitizations WHERE target_type='listing' AND listing_id=$1 AND state='active'`,[listingId])).rows[0];return data(row?workspaceRecord(row):null);});}
 @Post('me/owner-listings/:listingId/digitization') async ownerListing(@Req() req:FastifyRequest,@Param('listingId') listingId:string,@Body() body:unknown){const a=await this.identity.actor(req,['owner']),x=digitizationListingCreate.parse(body);z.uuid().parse(listingId);return transaction(a,async c=>{await digitizationListingAccess(c,a,listingId);return idempotent(c,a,req,x,async()=>data(await createListingDigitization(c,a,listingId,x.listingVersion)));});}
 @Post('me/digitizations/:id/evidence-grants') async grant(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['owner']),x=digitizationEvidenceGrantCreate.parse(body);z.uuid().parse(id);return transaction(a,async c=>{await checkedWorkspace(c,id);return idempotent(c,a,req,x,async()=>data(await grantOwnerEvidence(c,a,id,x)));});}
 @Get('ops/digitization-intakes/:id/events') async intakeEvents(@Req() req:FastifyRequest,@Param('id') id:string,@Res() reply:FastifyReply){z.uuid().parse(id);return streamDigitizationEvents(this.identity,req,reply,id,false);}
 @Get('ops/listings/:listingId/digitization/events') async listingEvents(@Req() req:FastifyRequest,@Param('listingId') listingId:string,@Res() reply:FastifyReply){z.uuid().parse(listingId);return streamDigitizationEvents(this.identity,req,reply,listingId,true);}

}
