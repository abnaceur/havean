import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {S3Client,ListObjectsV2Command,GetObjectCommand,PutObjectCommand,CreateBucketCommand,HeadObjectCommand}=require('@aws-sdk/client-s3');
const endpoint=process.env.RECOVERY_FIXTURE_STORAGE_ENDPOINT;
if(process.env.HAVEN_CONTAINER_TESTS!=='true'||!endpoint||!/^http:\/\/haven-recovery-[a-z0-9-]+-storage-1:8333$/.test(endpoint))throw Error('OWNED_ISOLATED_FIXTURE_STORAGE_REQUIRED');
const options={region:'us-east-1',forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',credentials:{accessKeyId:process.env.S3_ACCESS_KEY,secretAccessKey:process.env.S3_SECRET_KEY}};
const source=new S3Client({...options,endpoint:process.env.S3_ENDPOINT}),target=new S3Client({...options,endpoint});
let count=0,bytes=0;const proof=createHash('sha256'),sha=value=>createHash('sha256').update(value).digest('hex');
const send=(client,command)=>client.send(command,{abortSignal:AbortSignal.timeout(120000)});
try{
 for(const Bucket of ['haven-private','haven-public']){
  let ContinuationToken;
  try{await send(target,new CreateBucketCommand({Bucket}));}catch(e){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(e.name))throw e;}
  do{
   let listed;try{listed=await send(source,new ListObjectsV2Command({Bucket,ContinuationToken,MaxKeys:1000}));}catch(e){if(e.name==='NoSuchBucket')break;throw e;}
   for(const object of listed.Contents??[]){
    if(!object.Key||!object.ETag||!Number.isSafeInteger(object.Size)||object.Size<0||object.Size>128*1024*1024||count>=25000||bytes+object.Size>1024*1024*1024)throw Error('FIXTURE_OBJECT_COPY_BOUNDS_EXCEEDED');
    const input=await send(source,new GetObjectCommand({Bucket,Key:object.Key,IfMatch:object.ETag}));if(!input.Body||input.ContentLength!==object.Size)throw Error('FIXTURE_SOURCE_OBJECT_CHANGED');const body=await input.Body.transformToByteArray();if(body.length!==object.Size)throw Error('FIXTURE_SOURCE_TRANSFER_INCOMPLETE');
    await send(target,new PutObjectCommand({Bucket,Key:object.Key,Body:body,ContentType:input.ContentType,Metadata:input.Metadata,CacheControl:input.CacheControl,ContentDisposition:input.ContentDisposition}));
    const copied=await send(target,new GetObjectCommand({Bucket,Key:object.Key}));if(!copied.Body||copied.ContentLength!==body.length||copied.ContentType!==input.ContentType||sha(await copied.Body.transformToByteArray())!==sha(body))throw Error('FIXTURE_OBJECT_COPY_MISMATCH');
    const current=await send(source,new HeadObjectCommand({Bucket,Key:object.Key}));if(current.ETag!==object.ETag||current.ContentLength!==object.Size)throw Error('FIXTURE_SOURCE_OBJECT_CHANGED');
    proof.update(JSON.stringify([Bucket,object.Key,body.length,sha(body)])+'\n');count++;bytes+=body.length;
   }
   if(!listed.IsTruncated)break;ContinuationToken=listed.NextContinuationToken;if(!ContinuationToken)throw Error('FIXTURE_OBJECT_PAGINATION_INVALID');
  }while(ContinuationToken);
 }
 console.log(JSON.stringify({label:'P',status:'fixture-objects-copied-and-verified',objects:count,bytes,digest:proof.digest('hex'),sourceMutated:false,physicalPropertyEvidence:false}));
}finally{source.destroy();target.destroy();}
