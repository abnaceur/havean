import {Body,Controller,Delete,Inject,Param,Post,Req} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import type {Actor} from '@haven/database';
import {z} from 'zod';
import {digitizationAssetBind,digitizationInputEdit,digitizationInputReserve} from '@haven/contracts';
import {Identity,data,fail,idempotent,transaction} from '../../platform/core.js';
import {digitizationListingAccess} from '../property-access.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {appendInputRevision,reserveInputRevision} from './inputs.js';
import {verifySmallDigitizationSource} from './source-validation.js';

type Source=Omit<Awaited<ReturnType<typeof verifySmallDigitizationSource>>,'body'>;
async function currentEngine(c:pg.PoolClient,a:Actor,id:string,listing:boolean){
 z.uuid().parse(id);await requireDigitizationAgency(c,a);
 if(!listing)return (await checkedWorkspace(c,id,'intake')).id;
 await digitizationListingAccess(c,a,id);
 const row=(await c.query("SELECT id FROM property_digitizations WHERE listing_id=$1 AND state='active'",[id])).rows[0];
 if(!row)fail(404,'Create a digitization workspace before binding sources.');
 await checkedWorkspace(c,row.id,'listing',id);return row.id as string;
}
async function inheritedSources(c:pg.PoolClient,engine:string,nextRevision:number):Promise<Source[]>{
 if(nextRevision===1)return [];
 const workspace=await checkedWorkspace(c,engine);
 if(workspace.inputRevision!==nextRevision-1)fail(409,'The parent input revision is unavailable.','INPUT_REVISION_CONFLICT');
 const sources=(await c.query('SELECT digitization_current_input_manifest($1) AS sources',[engine])).rows[0]?.sources;
 if(!Array.isArray(sources))fail(409,'The parent input revision is unavailable.','INPUT_REVISION_CONFLICT');
 return sources.map((s:any)=>({...s,bytes:Number(s.bytes),inputRevision:nextRevision}));
}
@Controller('api/v1')
export class DigitizationInputController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 private async bind(req:FastifyRequest,target:string,listing:boolean,x:z.infer<typeof digitizationAssetBind>){
  const a=await this.identity.actor(req,['agent','agency_manager']);
  const snapshot=await transaction(a,async c=>{
   const engine=await currentEngine(c,a,target,listing);
   if((await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,req.headers['idempotency-key']])).rowCount){
    const receipt=await idempotent(c,a,req,x,async()=>{throw Error('Missing binding receipt');});
    return {engine,sources:[],receipt};
   }
   return {engine,sources:await inheritedSources(c,engine,x.inputRevision),receipt:null};
  });
  if(snapshot.receipt)return snapshot.receipt;
  // The existing small-upload scan gate precedes bounded object transfer, outside SQL.
  const {body:_body,...verified}=await verifySmallDigitizationSource(a,snapshot.engine,x.assetId,x.assetVersion,x.inputRevision,x.purpose);
  const sources=[...snapshot.sources.filter(s=>s.assetId!==x.assetId||s.purpose!==x.purpose),verified];
  return transaction(a,async c=>{await currentEngine(c,a,target,listing);return idempotent(c,a,req,x,async()=>{const w=await checkedWorkspace(c,snapshot.engine);if(w.inputRevision+1!==x.inputRevision)fail(409,'The source revision changed.','INPUT_REVISION_CONFLICT');return data(await appendInputRevision(c,a,snapshot.engine,x.version,sources));});});
 }
 private async remove(req:FastifyRequest,target:string,listing:boolean,bindingId:string,x:z.infer<typeof digitizationInputEdit>){
  const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(bindingId);
  return transaction(a,async c=>{const engine=await currentEngine(c,a,target,listing);return idempotent(c,a,req,x,async()=>{
   const w=await checkedWorkspace(c,engine);if(w.inputRevision+1!==x.inputRevision)fail(409,'The source revision changed.','INPUT_REVISION_CONFLICT');
   const binding=(await c.query('SELECT * FROM digitization_current_binding_ref($1,$2)',[engine,bindingId])).rows[0];
   if(!binding)fail(404,'Current source binding not found.');
   const sources=(await inheritedSources(c,engine,x.inputRevision)).filter(s=>s.assetId!==binding.asset_id||s.purpose!==binding.purpose);
   return data(await appendInputRevision(c,a,engine,x.version,sources));
  });});
 }
 @Post('ops/digitization-intakes/:id/asset-bindings') async bindIntake(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const x=digitizationAssetBind.parse(body);return this.bind(req,id,false,x);}
 @Post('ops/listings/:listingId/digitization/asset-bindings') async bindListing(@Req() req:FastifyRequest,@Param('listingId') listingId:string,@Body() body:unknown){const x=digitizationAssetBind.parse(body);return this.bind(req,listingId,true,x);}
 @Post('ops/listings/:listingId/digitization/input-reservations') async reserveListing(@Req() req:FastifyRequest,@Param('listingId') listingId:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationInputReserve.parse(body);
  return transaction(a,async c=>{const engine=await currentEngine(c,a,listingId,true);return idempotent(c,a,req,x,async()=>data(await reserveInputRevision(c,a,engine,x.version)));});
 }
 @Delete('ops/digitization-intakes/:id/asset-bindings/:bindingId') async removeIntake(@Req() req:FastifyRequest,@Param('id') id:string,@Param('bindingId') bindingId:string,@Body() body:unknown){const x=digitizationInputEdit.parse(body);return this.remove(req,id,false,bindingId,x);}
 @Delete('ops/listings/:listingId/digitization/asset-bindings/:bindingId') async removeListing(@Req() req:FastifyRequest,@Param('listingId') listingId:string,@Param('bindingId') bindingId:string,@Body() body:unknown){const x=digitizationInputEdit.parse(body);return this.remove(req,listingId,true,bindingId,x);}
}
