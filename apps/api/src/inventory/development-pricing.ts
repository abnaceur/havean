import {Controller,Patch,Param,Req,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {developmentPricing} from '@haven/contracts';
import {event} from '@haven/database';
import {Identity,transaction,idempotent,data,fail} from '../platform/core.js';
@Controller('api/v1')
export class DevelopmentPricingController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Patch('ops/developments/:id/pricing') async update(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['developer','admin']),x=developmentPricing.parse(body);return transaction(a,c=>idempotent(c,a,req,x,async()=>{const source=(await c.query('SELECT * FROM developments WHERE id=$1 AND (organization_id=$2 OR $3) FOR UPDATE',[id,a.orgId,a.roles.includes('admin')])).rows[0];if(!source)fail(404,'Assigned development not found');if(source.version!==x.version)fail(409,'Project changed. Reload before saving.');if(source.status==='sold_out')fail(409,'Reopen sales before changing project prices');const row=(await c.query('UPDATE developments SET price_min=$2,price_max=$3,price_basis=$4,version=version+1 WHERE id=$1 RETURNING *',[id,x.minimum,x.maximum,x.priceBasis==='per_area'?'per m²':'starting total'])).rows[0];await event(c,a,id,'development.pricing_updated',{version:row.version});return data(row);}));}
}
