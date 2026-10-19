import sharp from 'sharp';
import {createRequire} from 'node:module';
import {fail} from '../platform/core.js';
const {validateBytes}=createRequire(import.meta.url)('gltf-validator') as {validateBytes:(bytes:Uint8Array,options:Record<string,unknown>)=>Promise<{issues:{numErrors:number}}>};
/** Uploaded plans must be bounded, self-contained GLB 2.0 files. Never fetch remote resources. */
export async function validatePropertyModel(body:Buffer){
 try{
  if(body.length<28||body.length>32*1024*1024||body.readUInt32LE(0)!==0x46546c67||body.readUInt32LE(4)!==2||body.readUInt32LE(8)!==body.length||body.readUInt32LE(16)!==0x4e4f534a)throw Error();
  const length=body.readUInt32LE(12);if(length>2*1024*1024||20+length+8>body.length)throw Error();
  const doc=JSON.parse(body.subarray(20,20+length).toString('utf8'));
  if(doc.asset?.version!=='2.0'||doc.buffers?.length!==1||doc.buffers[0].uri!==undefined||!doc.meshes?.length||doc.meshes.length>2000||(doc.nodes?.length||0)>5000||(doc.images?.length||0)>32||doc.extensionsUsed?.length||doc.extensionsRequired?.length)throw Error();
  // Reject nested extension payloads and every URI, including embedded data URLs.
  function inspect(value:unknown,depth=0){if(depth>64)throw Error();if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='uri'||key==='extensions')throw Error();inspect(item,depth+1);}}
  inspect(doc);
  if((doc.accessors||[]).some((a:any)=>!Number.isSafeInteger(a.count)||a.count>3000000)||(doc.images||[]).some((i:any)=>!Number.isInteger(i.bufferView)||!['image/png','image/jpeg'].includes(i.mimeType)))throw Error();
  const report=await validateBytes(new Uint8Array(body),{maxIssues:20,externalResourceFunction:()=>Promise.reject(Error('External resources are not supported'))});if(report.issues.numErrors)throw Error();
  let pixels=0;for(const image of doc.images||[]){const view=doc.bufferViews[image.bufferView],start=28+length+(view.byteOffset||0);const metadata=await sharp(body.subarray(start,start+view.byteLength),{limitInputPixels:16e6,failOn:'warning'}).metadata();if(!metadata.width||!metadata.height||metadata.width>4096||metadata.height>4096||metadata.format!==(image.mimeType==='image/png'?'png':'jpeg'))throw Error();pixels+=metadata.width*metadata.height;if(pixels>32e6)throw Error();}

 }catch{fail(400,'Upload a valid self-contained GLB 2.0 plan (up to 32 MB), without external resources or extensions.','INVALID_PROPERTY_MODEL');}
}
