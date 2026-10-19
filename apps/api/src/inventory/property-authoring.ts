import {Controller,Get,Post,Patch,Req,Param,Body,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import {propertyAuthoringCreate,propertyAuthoringSave,propertyAuthoringVersion,type PropertyAuthoringData} from '@haven/contracts';
import {event,type Actor} from '@haven/database';
import {Identity,data,fail,transaction,idempotent} from '../platform/core.js';
import {createInventoryDraft,updateInventoryDraft,scopedDraft} from './drafts.js';
import {authoringFacts as facts,authoringUnit,validateAuthoringFields} from './property-authoring-validation.js';
import {missingListingMedia} from './required-media.js';
import {changeListingState} from './workflow.js';
const columns='id,listing_id,data,step,version,status,updated_at';
async function editable(c:pg.PoolClient,a:Actor,id:string){const listing=await scopedDraft(c,a,id,true);if(!['draft','rejected'].includes(listing.status))fail(409,'This property is no longer an editable draft');return listing;}
async function checkpoint(c:pg.PoolClient,a:Actor,id:string,version?:number){
 z.uuid().parse(id);const row=(await c.query(`SELECT ${columns} FROM property_authoring_drafts WHERE id=$1 AND user_id=$2 AND organization_id IS NOT DISTINCT FROM $3 FOR UPDATE`,[id,a.id,a.orgId||null])).rows[0];
 if(!row)fail(404,'Property draft not found');if(row.status!=='draft')fail(409,'This property has already been submitted');if(version!==undefined&&row.version!==version)fail(409,'This draft changed in another session. Reopen it before continuing.','DRAFT_CHANGED');if(row.listing_id)await editable(c,a,row.listing_id);return row;
}
@Controller('api/v1')
export class PropertyAuthoringController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/property-drafts') async list(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['agent','agency_manager','admin']);return transaction(a,async c=>data((await c.query(`SELECT ${columns.split(',').map(x=>'d.'+x).join(',')} FROM property_authoring_drafts d WHERE d.user_id=$1 AND d.organization_id IS NOT DISTINCT FROM $2 AND d.status='draft' AND (d.listing_id IS NULL OR EXISTS(SELECT 1 FROM listings l WHERE l.id=d.listing_id AND l.status IN ('draft','rejected'))) ORDER BY d.updated_at DESC LIMIT 200`,[a.id,a.orgId||null])).rows));}
 @Post('ops/property-drafts') async create(@Req() req:FastifyRequest,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager','admin']),x=propertyAuthoringCreate.parse(body);return transaction(a,c=>idempotent(c,a,req,x,async()=>{
  if(x.step>0)validateAuthoringFields(x.data,0);
  if(x.listingId){const listing=await editable(c,a,x.listingId);if(listing.version!==x.data.listingVersion)fail(409,'This property changed. Reopen it before editing.');}
  const row=(await c.query(`INSERT INTO property_authoring_drafts(user_id,organization_id,listing_id,data,step) VALUES($1,$2,$3,$4,$5) RETURNING ${columns}`,[a.id,a.orgId||null,x.listingId||null,JSON.stringify(x.data),x.step])).rows[0];await event(c,a,row.id,'property.authoring_started');return data(row);
 }));}
 @Get('ops/property-drafts/:id') async read(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager','admin']);return transaction(a,async c=>data(await checkpoint(c,a,id)));}
 @Patch('ops/property-drafts/:id') async save(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager','admin']),x=propertyAuthoringSave.parse(body);return transaction(a,async c=>{
  const prior=await checkpoint(c,a,id,x.version);
  if(x.step>prior.step){validateAuthoringFields(x.data,x.step===1?0:1);if(x.step===3&&prior.listing_id){const missing=await missingListingMedia(c,prior.listing_id);if(missing.length)throw new z.ZodError(missing.map(kind=>({code:'custom',path:['media.'+kind],message:kind==='photo'?'Upload at least one property photo before continuing.':'Upload a floor plan before continuing.'})));}}
  if(x.step>1&&!prior.listing_id)fail(409,'Complete the property details before adding media');
  const row=(await c.query(`UPDATE property_authoring_drafts SET data=$2,step=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING ${columns}`,[id,JSON.stringify(x.data),x.step])).rows[0];await event(c,a,id,'property.authoring_saved',{step:x.step,version:row.version});return data(row);
 });}
 @Post('ops/property-drafts/:id/prepare') async prepare(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager','admin']),x=propertyAuthoringVersion.parse(body);return transaction(a,c=>idempotent(c,a,req,x,async()=>{
  const prior=await checkpoint(c,a,id,x.version),d:PropertyAuthoringData=prior.data;
  validateAuthoringFields(d,1);
  const listing=prior.listing_id?await updateInventoryDraft(c,a,prior.listing_id,{...facts(d),version:d.listingVersion}):await createInventoryDraft(c,a,{...facts(d),...(d.newUnit?{unit:authoringUnit(d)}:{unitId:d.unitId})});
  const row=(await c.query(`UPDATE property_authoring_drafts SET listing_id=$2,data=$3,step=2,version=version+1,updated_at=now() WHERE id=$1 RETURNING ${columns}`,[id,listing.id,JSON.stringify({...d,listingVersion:listing.version})])).rows[0];await event(c,a,id,'property.authoring_prepared',{listingId:listing.id});return data(row);
 }));}
 @Post('ops/property-drafts/:id/submit') async submit(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager','admin']),x=propertyAuthoringVersion.parse(body);return transaction(a,c=>idempotent(c,a,req,x,async()=>{
  const prior=await checkpoint(c,a,id,x.version);if(!prior.listing_id)fail(409,'Complete property details and media before submitting');
  // Revalidate and apply the saved details in the same transaction as submission.
  validateAuthoringFields(prior.data,1);
  const listing=await updateInventoryDraft(c,a,prior.listing_id,{...facts(prior.data),version:prior.data.listingVersion});
  await changeListingState(c,a,listing.id,{status:'submitted',version:listing.version,reason:'Submitted by the authorized property author'});
  const row=(await c.query(`UPDATE property_authoring_drafts SET status='submitted',version=version+1,updated_at=now() WHERE id=$1 RETURNING ${columns}`,[id])).rows[0];await event(c,a,id,'property.authoring_submitted');return data(row);
 }));}
}
