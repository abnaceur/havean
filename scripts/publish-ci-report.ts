import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const requireApi=createRequire(new URL('../apps/api/package.json',import.meta.url));
const {S3Client,CreateBucketCommand,PutObjectCommand,GetObjectCommand}=requireApi('@aws-sdk/client-s3');
const bucket='haven-ci-reports',key='runs/'+randomUUID()+'.json';
const logs=Object.fromEntries(fs.readdirSync('evidence/ci').filter(name=>name.endsWith('.log')).sort().map(name=>[name,fs.readFileSync('evidence/ci/'+name,'utf8')]));
const body=Buffer.from(JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),fixture:JSON.parse(fs.readFileSync('evidence/latest-fixture-fingerprint.json','utf8')),logs}));
const sha256=createHash('sha256').update(body).digest('hex');
const s3=new S3Client({region:'us-east-1',endpoint:process.env.S3_ENDPOINT,forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',credentials:{accessKeyId:process.env.S3_ACCESS_KEY,secretAccessKey:process.env.S3_SECRET_KEY}});
try{
 try{await s3.send(new CreateBucketCommand({Bucket:bucket}));}catch(error:any){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name)&&error.$metadata?.httpStatusCode!==409)throw error;}
 await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:'application/json'}));
 const result=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
 const verified=createHash('sha256').update(Buffer.from(await result.Body.transformToByteArray())).digest('hex')===sha256;
 if(!verified)throw Error('CI report readback did not match its upload');
 fs.writeFileSync('evidence/ci/report-upload.json',JSON.stringify({bucket,key,sha256,bytes:body.length,verified,reportCount:Object.keys(logs).length},null,2)+'\n');
 console.log('Sanitized CI report uploaded and read back successfully');
}finally{s3.destroy();}
