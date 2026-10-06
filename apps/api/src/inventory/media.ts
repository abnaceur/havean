import {Controller,Post,Put,Get,Param,Req,Res,Body,Inject} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import sharp from 'sharp';
import {S3Client,CreateBucketCommand,PutObjectCommand,GetObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {Identity,env,transaction,data,fail,encrypt,decrypt,idempotent} from '../platform/core.js';
import {event} from '@haven/database';
import {canReadPrivateEvidence} from './moderation-evidence.js';
import {scanFile} from './scanner.js';
import {transcodeVideo} from './video.js';
const bucket='haven-private';
const s3=new S3Client({requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',region:'us-east-1',endpoint:env.S3_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:env.S3_ACCESS_KEY,secretAccessKey:env.S3_SECRET_KEY}});
@Controller('api/v1')
export class MediaController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Post('media/upload-intents') async intent(@Req() req:FastifyRequest,@Body() body:unknown){
  const a=await this.identity.actor(req);
  const x=z.object({mime:z.enum(['image/jpeg','image/png','application/pdf','video/mp4','video/webm']),size:z.number().int().positive().max(40*1024*1024),rights:z.string().min(5).max(300),visibility:z.enum(['private','public']),purpose:z.enum(['photo','floor_plan','panorama','video','document']).optional()}).parse(body);
  const purpose=x.purpose||(x.mime.startsWith('video/')?'video':x.mime==='application/pdf'?'document':'photo');
  const limit=purpose==='video'?40*1024*1024:purpose==='panorama'||purpose==='document'?20*1024*1024:10*1024*1024;
  if(x.size>limit||(purpose==='video'?!x.mime.startsWith('video/'):purpose==='document'?x.mime!=='application/pdf':!x.mime.startsWith('image/'))||(x.visibility==='public'&&purpose==='document'))fail(400,'Unsupported file type, purpose, visibility or upload size');
  return transaction(a,async c=>{const r=await c.query('INSERT INTO media_assets(owner_id,object_key,mime,size,rights,visibility,purpose) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[a.id,crypto.randomUUID(),x.mime,x.size,x.rights,x.visibility,purpose]);const id=r.rows[0].id,signature=encrypt({assetId:id,actorId:a.id,expires:Date.now()+600000});return data({id,uploadUrl:'/api/v1/media/'+id+'/content?signature='+signature,method:'PUT',expiresIn:600});});
 }
 @Get('media/:id/status') async status(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req);return transaction(a,async c=>{const m=(await c.query('SELECT id,status,purpose,width,height,duration,scan_at FROM media_assets WHERE id=$1 AND owner_id=$2',[id,a.id])).rows[0];if(!m)fail(404,'Owned upload not found');return data(m);});}
 @Put('media/:id/content') async content(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:Buffer){
  const a=await this.identity.actor(req);let signature;
  try{signature=decrypt<{assetId:string;actorId:string;expires:number}>((req.query as any).signature||'');}catch{fail(400,'The signed upload link is invalid');}
  if(signature.assetId!==id||signature.actorId!==a.id||signature.expires<Date.now())fail(400,'The signed upload link is invalid or expired');
  if(!Buffer.isBuffer(body))fail(400,'Upload binary file content');
  return transaction(a,async c=>{
   const m=(await c.query("SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND status='quarantined' AND created_at>now()-interval '1 hour' FOR UPDATE",[id,a.id])).rows[0];
   if(!m)fail(404,'Valid upload intent not found');
   if(body.length!==Number(m.size)||body.length>40*1024*1024||req.headers['content-type']!==m.mime)fail(400,'File size or content type does not match the upload intent');
   try{await s3.send(new CreateBucketCommand({Bucket:bucket}));}catch(e:any){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name)&&e.$metadata?.httpStatusCode!==409)throw e;}
   await s3.send(new PutObjectCommand({Bucket:bucket,Key:'quarantine/'+m.object_key,Body:body,ContentType:m.mime}));
   await scanFile(body);
   const variants:Record<string,string>={};let width:number|undefined,height:number|undefined,duration:number|undefined;
   if(m.mime.startsWith('image/')){
    let variant:Buffer,thumbnail:Buffer;
    try{
     const image=sharp(body,{limitInputPixels:40e6,failOn:'warning'}),metadata=await image.metadata();
     if(metadata.format!==(m.mime==='image/jpeg'?'jpeg':'png'))fail(400,'Unsupported decoded image format');
     width=metadata.width;height=metadata.height;
     if(m.purpose==='panorama'&&(!width||!height||width<1024||Math.abs(width/height-2)>0.05))fail(400,'A panorama must be an equirectangular image with a 2:1 ratio and at least 1024 pixels wide');
     variant=await image.rotate().resize({width:m.purpose==='panorama'?4096:2000,height:m.purpose==='panorama'?2048:1600,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();
     thumbnail=await sharp(variant).resize({width:480,withoutEnlargement:true}).webp({quality:80}).toBuffer();
    }catch(error:any){if(error.getStatus)throw error;fail(400,'This file is not a valid supported image');}
    variants.display='variants/'+m.object_key+'.webp';variants.thumbnail='variants/'+m.object_key+'-thumb.webp';
    await s3.send(new PutObjectCommand({Bucket:bucket,Key:variants.display,Body:variant,ContentType:'image/webp'}));
    await s3.send(new PutObjectCommand({Bucket:bucket,Key:variants.thumbnail,Body:thumbnail,ContentType:'image/webp'}));
   }else if(m.mime.startsWith('video/')){
    const result=await transcodeVideo(body,m.mime);width=result.width;height=result.height;duration=result.duration;
    variants.video='variants/'+m.object_key+'.mp4';variants.display='variants/'+m.object_key+'-poster.webp';
    await s3.send(new PutObjectCommand({Bucket:bucket,Key:variants.video,Body:result.video,ContentType:'video/mp4'}));
    await s3.send(new PutObjectCommand({Bucket:bucket,Key:variants.display,Body:result.poster,ContentType:'image/webp'}));
   }else if(!body.subarray(0,5).equals(Buffer.from('%PDF-'))||!body.includes(Buffer.from('%%EOF'))||/\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile|\/Encrypt/.test(body.toString('latin1')))fail(400,'Only unencrypted PDF documents without active content are accepted');
   await c.query("UPDATE media_assets SET status='approved',width=$2,height=$3,variants=$4,duration=$5,scan_at=now() WHERE id=$1",[id,width,height,JSON.stringify(variants),duration]);
   await event(c,a,id,'media.approved');return data({id,status:'approved',visibility:m.visibility,purpose:m.purpose});
  });
 }
 @Get('media/:id/view') async view(@Req() req:FastifyRequest,@Param('id') id:string,@Res() reply:FastifyReply){const a=req.headers.cookie?.includes('haven_session=')?await this.identity.actor(req).catch(()=>null):null;return transaction(a,async c=>{const m=(await c.query("SELECT variants FROM media_assets WHERE id=$1 AND visibility='public' AND status='approved' AND scan_at IS NOT NULL",[id])).rows[0];if(!m?.variants.display)fail(404,'Public image not found');const result=await s3.send(new GetObjectCommand({Bucket:bucket,Key:m.variants.display}));reply.header('Content-Type','image/webp');reply.header('Cache-Control','private,no-store');return reply.send(Buffer.from(await result.Body!.transformToByteArray()));});}
 @Get('media/:id/video') async video(@Req() req:FastifyRequest,@Param('id') id:string,@Res() reply:FastifyReply){const a=req.headers.cookie?.includes('haven_session=')?await this.identity.actor(req).catch(()=>null):null;return transaction(a,async c=>{
  const m=(await c.query("SELECT variants FROM media_assets WHERE id=$1 AND visibility='public' AND status='approved' AND scan_at IS NOT NULL AND purpose='video'",[id])).rows[0];if(!m?.variants.video)fail(404,'Public video not found');
  const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:m.variants.video})),size=Number(head.ContentLength);
  reply.header('Content-Type','video/mp4').header('Accept-Ranges','bytes').header('Cache-Control','private,no-store');
  let range:string|undefined;if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||(!match[1]&&!match[2]))fail(416,'Invalid video byte range');const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)fail(416,'Invalid video byte range');range=`bytes=${start}-${end}`;reply.code(206).header('Content-Range',`bytes ${start}-${end}/${size}`).header('Content-Length',end-start+1);}else reply.header('Content-Length',size);
  const result=await s3.send(new GetObjectCommand({Bucket:bucket,Key:m.variants.video,...(range?{Range:range}:{})}));return reply.send(Buffer.from(await result.Body!.transformToByteArray()));
 });}
 @Post('documents/:id/download-link') async downloadLink(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req);return transaction(a,async c=>{const m=(await c.query("SELECT owner_id FROM media_assets WHERE id=$1 AND visibility='private' AND status='approved'",[id])).rows[0];if(!m||!(await canReadPrivateEvidence(c,a,id,m.owner_id)))fail(404,'Document not found');return data({url:'/api/v1/documents/'+id+'/download?signature='+encrypt({assetId:id,actorId:a.id,expires:Date.now()+60000}),expiresIn:60});});}
 @Get('documents/:id/download') async download(@Req() req:FastifyRequest,@Param('id') id:string,@Res() reply:FastifyReply){const a=await this.identity.actor(req);const ticket=(req.query as any).signature;if(ticket){let signature;try{signature=decrypt<{assetId:string;actorId:string;expires:number}>(ticket);}catch{fail(403,'Download link is invalid');}if(signature.assetId!==id||signature.actorId!==a.id||signature.expires<Date.now())fail(403,'Download link is invalid or expired');}return transaction(a,async c=>{const m=(await c.query("SELECT * FROM media_assets WHERE id=$1 AND visibility='private' AND status='approved'",[id])).rows[0];if(!m||!(await canReadPrivateEvidence(c,a,id,m.owner_id)))fail(404,'Document not found');const result=await s3.send(new GetObjectCommand({Bucket:bucket,Key:'quarantine/'+m.object_key}));await event(c,a,id,'document.downloaded');reply.header('Content-Type',m.mime);reply.header('Content-Disposition','attachment; filename="ownership-evidence.pdf"');reply.header('Cache-Control','no-store');return reply.send(Buffer.from(await result.Body!.transformToByteArray()));});}
 @Post('owner-submissions/:id/documents') async attach(@Req() req:FastifyRequest,@Param('id') id:string,@Body() body:unknown){
 const a=await this.identity.actor(req);const x=z.object({mediaId:z.string().uuid(),version:z.number().int().positive(),documentType:z.enum(['ownership','authorization']).optional()}).strict().parse(body);z.uuid().parse(id);
 return transaction(a,c=>idempotent(c,a,req,x,async()=>{
 const submission=(await c.query("SELECT * FROM owner_submissions WHERE id=$1 AND user_id=$2 AND status IN ('draft','submitted') FOR UPDATE",[id,a.id])).rows[0];
 if(!submission)fail(404,'Editable property request not found');if(submission.version!==x.version)fail(409,'Property request changed; reload before attaching.');
 const m=(await c.query("SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND status='approved'",[x.mediaId,a.id])).rows[0];
 if(!m)fail(404,'Approved owned upload not found');
 const photo=m.purpose==='photo'&&m.visibility==='public'&&['image/jpeg','image/png'].includes(m.mime),document=m.purpose==='document'&&m.visibility==='private'&&m.mime==='application/pdf';
 if(!photo&&!document)fail(400,'Attach approved property photos or private PDF evidence.');if(photo&&x.documentType)fail(400,'Only private documents have an evidence type.');
 const field=photo?'photos':'documents',values=Array.from(new Set([...(submission.data[field]||[]),x.mediaId]));if(values.length>10)fail(400,'Each property request allows up to ten photos and ten documents.');
 const patch:any={[field]:values};if(document)patch.documentTypes={...(submission.data.documentTypes||{}),[x.mediaId]:x.documentType||'ownership'};
 await c.query('UPDATE owner_submissions SET data=data||$2::jsonb,version=version+1 WHERE id=$1',[id,JSON.stringify(patch)]);await event(c,a,id,'owner.media_attached',{version:x.version+1,kind:document?patch.documentTypes[x.mediaId]:'photo'});return data({attached:true});
 }));
 }
}
