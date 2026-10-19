import {Body,Controller,Get,Inject,Param,Post,Req} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {z} from 'zod';
import {digitizationTenantDeletionCreate,digitizationTenantDeletionContext,digitizationTenantDeletionReceipt,digitizationTenantDeletionOrganizations} from '@haven/contracts';
import {Identity,data,idempotent,transaction,fail} from '../../platform/core.js';
@Controller('api/v1')
export class DigitizationTenantDeletionController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/digitization-deletion-organizations') async organizations(@Req() req:FastifyRequest){const actor=await this.identity.actor(req,['admin']);return transaction(actor,async c=>{if(!(await c.query('SELECT platform_admin_lock() allowed')).rows[0].allowed)fail(403,'Current platform administrator required.');return data(digitizationTenantDeletionOrganizations.parse((await c.query('SELECT id,name FROM organizations ORDER BY name,id LIMIT 1000')).rows));});}
 @Get('ops/organizations/:organizationId/digitization-deletion') async context(@Req() req:FastifyRequest,@Param('organizationId') id:string){
  const actor=await this.identity.actor(req,['admin']);z.uuid().parse(id);
  return transaction(actor,async c=>data(digitizationTenantDeletionContext.parse((await c.query('SELECT digitization_tenant_deletion_context($1) context',[id])).rows[0].context)));
 }
 @Post('ops/organizations/:organizationId/digitization-deletion') async request(@Req() req:FastifyRequest,@Param('organizationId') id:string,@Body() body:unknown){
  const actor=await this.identity.actor(req,['admin']),input=digitizationTenantDeletionCreate.parse(body);z.uuid().parse(id);
  return transaction(actor,async c=>{
   // Recheck current administrator authority before even an idempotent replay.
   await c.query('SELECT digitization_tenant_deletion_context($1)',[id]);
   const result=await idempotent(c,actor,req,input,async()=>data(digitizationTenantDeletionReceipt.parse((await c.query('SELECT digitization_request_tenant_deletion($1,$2,$3,$4) receipt',[id,input.scopeVersion,input.deletionConfirmed,input.reason])).rows[0].receipt)));
   if(result.data.organizationId!==id)fail(403,'Tenant deletion receipt scope changed.');return result;
  });
 }
}
