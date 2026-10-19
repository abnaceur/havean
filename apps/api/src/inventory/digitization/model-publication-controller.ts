import {Body,Controller,Get,Inject,Param,Post,Req,Res} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {digitizationModelPublicationCreate,digitizationModelPublicationReviews} from '@haven/contracts';
import {Identity,data,idempotent,transaction,fail} from '../../platform/core.js';
import {prepareModelPublication,proposeModelPublication,readPublicModel,readPublicModelContent} from './model-publication.js';
@Controller('api/v1')
export class DigitizationModelPublicationController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('ops/digitizations/:id/model-publication-proposals') async propose(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager']),input=digitizationModelPublicationCreate.parse(body);z.uuid().parse(id);const prepared=await prepareModelPublication(a,id,input);return transaction(a,async c=>{const result=await idempotent(c,a,req,input,async()=>data(await proposeModelPublication(c,a,id,prepared)));const receipt=(await c.query('SELECT 1 FROM digitization_model_publication_proposals WHERE listing_revision_id=$1 AND digitization_id=$2 AND created_by=$3',[result.data.revisionId,id,a.id])).rowCount;if(!receipt)fail(403,'Model publication receipt scope changed.');return result;});}
 @Get('ops/digitization-model-publication-reviews') async queue(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['moderator','admin']);return transaction(a,async c=>data(digitizationModelPublicationReviews.parse((await c.query('SELECT digitization_model_publication_review_queue() rows')).rows[0].rows)));}
 @Get('listings/:listingId/digitization-model') async manifest(@Req() req:FastifyRequest,@Param('listingId') listing:string){z.uuid().parse(listing);return data(await readPublicModel(null,listing));}
 @Get('listings/:listingId/digitization-packages/:packageId/model') async content(@Req() req:FastifyRequest,@Param('listingId') listing:string,@Param('packageId') packageId:string,@Res() reply:FastifyReply){z.uuid().parse(listing);z.uuid().parse(packageId);const result=await readPublicModelContent(null,listing,packageId);return reply.header('Content-Type',result.format).header('Cache-Control','private,no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").send(result.body);}
}
