import {Body,Controller,Get,Inject,Param,Post,Query,Req,Res} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {digitizationFrameDatasetCreate,digitizationFramePrivacyCreate,digitizationCameraCreate,digitizationTrainingCreate} from '@haven/contracts';
import {Identity,data,idempotent,transaction} from '../../platform/core.js';
import {frameCandidates,analyzeFrameDataset,commitFrameDataset,frameDatasetContext,latestFrameDataset} from './frame-datasets.js';
import {createFramePrivacy,framePrivacyContext,preparePrivateTrainingFrames} from './frame-privacy.js';
import {currentCameraRecipe,prepareCameraProcessing,commitCameraProcessing} from './camera-input.js';
import {latestCameraReview,readCameraTrainingArchive} from './camera-results.js';
import {readReconstructionStatus} from './reconstruction-status.js';
import {trainingContext,startTrainingProcessing} from './training-input.js';
@Controller('api/v1')
export class DigitizationFrameController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/digitizations/:id/frame-candidates') async candidates(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>data(await frameCandidates(c,a,id)));}
 @Post('ops/digitizations/:id/scene-training') async train(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){const a=await this.identity.actor(req,['agent','agency_manager']),x=digitizationTrainingCreate.parse(body);z.uuid().parse(id);return transaction(a,async c=>{await trainingContext(c,a,id,x);return idempotent(c,a,req,x,async()=>data(await startTrainingProcessing(c,a,id,x)));});}
 @Get('ops/digitizations/:id/reconstruction-status') async reconstructionStatus(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>data(await readReconstructionStatus(c,a,id)));}
 @Post('ops/digitizations/:id/camera-processing') async camera(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),input=digitizationCameraCreate.parse(body);z.uuid().parse(id);
  const prior=await transaction(a,async c=>{await currentCameraRecipe(c,a,id,input.recipeId,input.workspaceVersion,input.inputRevision);if((await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,req.headers['idempotency-key']])).rowCount)return idempotent(c,a,req,input,async()=>{throw Error('Missing camera receipt');});return null;});if(prior)return prior;
  const prepared=await prepareCameraProcessing(a,id,input);
  return transaction(a,async c=>{await currentCameraRecipe(c,a,id,input.recipeId,input.workspaceVersion,input.inputRevision);return idempotent(c,a,req,input,async()=>data(await commitCameraProcessing(c,a,id,input,prepared)));});
 }
 @Get('ops/digitizations/:id/camera-processing/latest') async cameraReport(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>data(await latestCameraReview(c,a,id)));}
 @Get('ops/digitizations/:id/camera-processing/:reportId/training.tar') async calibratedTraining(@Req() req:FastifyRequest,@Param('id') id:string,@Param('reportId') reportId:string,@Res() reply:FastifyReply){
  const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);z.uuid().parse(reportId);const body=await readCameraTrainingArchive(a,id,reportId);
  return reply.header('Content-Type','application/x-tar').header('Content-Disposition','attachment; filename="private-calibrated-training.tar"').header('Cache-Control','private,no-store').header('X-Content-Type-Options','nosniff').send(body);
 }
 @Post('ops/digitizations/:id/frame-datasets') async create(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),input=digitizationFrameDatasetCreate.parse(body);z.uuid().parse(id);
  const prior=await transaction(a,async c=>{await frameDatasetContext(c,a,id,input);if((await c.query('SELECT 1 FROM idempotency WHERE actor_id=$1 AND key=$2',[a.id,req.headers['idempotency-key']])).rowCount)return idempotent(c,a,req,input,async()=>{throw Error('Missing frame dataset receipt');});return null;});
  if(prior)return prior;
  const prepared=await analyzeFrameDataset(a,id,input);
  return transaction(a,async c=>{await frameDatasetContext(c,a,id,input);return idempotent(c,a,req,input,async()=>data(await commitFrameDataset(c,a,id,input,prepared)));});
 }
 @Get('ops/digitizations/:id/frame-datasets/latest') async latest(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req,['agent','agency_manager']);z.uuid().parse(id);return transaction(a,async c=>data(await latestFrameDataset(c,a,id)));}
 @Post('ops/digitizations/:id/frame-privacy-recipes') async privacy(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
  const a=await this.identity.actor(req,['agent','agency_manager']),input=digitizationFramePrivacyCreate.parse(body);z.uuid().parse(id);
  return transaction(a,async c=>{await framePrivacyContext(c,a,id,input);return idempotent(c,a,req,input,async()=>data(await createFramePrivacy(c,a,id,input)));});
 }
 @Get('ops/digitizations/:id/frame-privacy-recipes/:recipeId/training.tar') async training(@Req() req:FastifyRequest,@Param('id') id:string,@Param('recipeId') recipeId:string,@Query() input:unknown,@Res() reply:FastifyReply){
  const a=await this.identity.actor(req,['agent','agency_manager']),x=z.strictObject({workspaceVersion:z.coerce.number().int().positive(),inputRevision:z.coerce.number().int().positive()}).parse(input);z.uuid().parse(id);z.uuid().parse(recipeId);
  const body=await preparePrivateTrainingFrames(a,id,recipeId,x.workspaceVersion,x.inputRevision);
  return reply.header('Content-Type','application/x-tar').header('Content-Disposition','attachment; filename="private-training-frames.tar"').header('Cache-Control','private,no-store').header('X-Content-Type-Options','nosniff').send(body);
 }
}
