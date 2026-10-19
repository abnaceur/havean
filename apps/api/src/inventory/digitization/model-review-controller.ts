import {Body,Controller,Get,Inject,Param,Post,Req,Res} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {digitizationModelReviewCreate,digitizationModelReviewDecision,digitizationModelReviewQueue} from '@haven/contracts';
import {Identity,data,idempotent,transaction,fail} from '../../platform/core.js';
import {prepareModelReview,submitModelReview,readModelReview,modelReviewQueue,verifyModelReview,decideModelReview,readModelReviewPreview,currentModelReviews} from './model-review.js';
@Controller('api/v1')
export class DigitizationModelReviewController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('ops/digitizations/:id/model-review-requests') async submit(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),input=digitizationModelReviewCreate.parse(body);z.uuid().parse(id);
  const prepared=await prepareModelReview(a,id,input);
  return transaction(a,async c=>{const result=await idempotent(c,a,req,input,async()=>data(await submitModelReview(c,a,id,prepared)));
   const context=(await c.query('SELECT digitization_model_review_context($1) context',[result.data.id])).rows[0].context;
   if(context.request.digitization_id!==id||context.request.created_by!==a.id)fail(403,'The model review receipt scope changed.');return result;});
 }
 @Get('ops/digitizations/:id/model-reviews') async latest(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>data(digitizationModelReviewQueue.parse(await currentModelReviews(c,a,id))));}
 @Get('ops/digitization-model-reviews') async queue(@Req() req:FastifyRequest){const a=await this.identity.actor(req,['moderator','admin']);return transaction(a,async c=>data(digitizationModelReviewQueue.parse(await modelReviewQueue(c))));}
 @Get('ops/digitization-model-reviews/:reviewId') async detail(@Req() req:FastifyRequest,@Param('reviewId') id:string){const a=await this.identity.actor(req,['agent','agency_manager','moderator','admin']);z.uuid().parse(id);return data(await readModelReview(a,id));}
 @Post('ops/digitization-model-reviews/:reviewId/review') async review(@Req() req:FastifyRequest,@Param('reviewId') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['moderator','admin']),input=digitizationModelReviewDecision.parse(body);z.uuid().parse(id);const verified=await verifyModelReview(a,id);return transaction(a,async c=>{const fresh=(await c.query('SELECT digitization_model_review_context($1) context',[id])).rows[0].context;if(JSON.stringify(fresh)!==JSON.stringify(verified.context))fail(409,'Model dependencies changed.');return idempotent(c,a,req,input,async()=>data(await decideModelReview(c,a,id,input,verified)));});}
 @Get('ops/digitization-model-reviews/:reviewId/content') async content(@Req() req:FastifyRequest,@Param('reviewId') id:string,@Res() reply:FastifyReply){const a=await this.identity.actor(req,['agent','agency_manager','moderator','admin']);z.uuid().parse(id);const result=await readModelReviewPreview(a,id);return reply.header('Content-Type',result.format).header('Cache-Control','private,no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").send(result.body);}
}
