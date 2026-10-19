import {env} from '../../platform/core.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

/** Local opt-in only. An investigation flag cannot admit a production model. */
export function developmentDocumentOcrAvailable(){
 return env.NODE_ENV==='development'&&process.env.PROCESSING_DEPLOYMENT==='development'&&process.env.PROCESSING_ENABLE_OCR_INVESTIGATION==='true';
}
export function investigationOcrProfilesAvailable(){
 return env.NODE_ENV!=='production'&&(developmentDocumentOcrAvailable()||process.env.HAVEN_CONTAINER_TESTS==='true'&&process.env.PROCESSING_DEPLOYMENT==='test'&&process.env.PROCESSING_ENABLE_OCR_INVESTIGATION==='true');
}
/** A deployment opt-in must identify the separately admitted, packaged release. */
export function productionDocumentOcrAvailable(){
 if(process.env.PROCESSING_ENABLE_OCR!=='true')return false;
 const expected=process.env.PROCESSING_OCR_RELEASE_SHA256;
 if(!expected||!/^[a-f0-9]{64}$/.test(expected))return false;
 try{
  const body=readFileSync('services/property-processing/ocr-production-release.json');
  if(body.length>2097152||createHash('sha256').update(body).digest('hex')!==expected)return false;
  const release=JSON.parse(body.toString());
  return release.schemaVersion===1&&release.id==='paddleocr-3.3.3-offline-cpu-v1'&&release.enabled===true&&release.runtimeDownloads===false&&release.distributionReview?.status==='complete';
 }catch{return false;}
}
export function documentOcrAvailable(){return productionDocumentOcrAvailable()||developmentDocumentOcrAvailable();}
export function documentOcrProfileAllowed(profile:string){
 return /^private-ocr-(document|image)-(en|fr|ar)-v1$/.test(profile)?productionDocumentOcrAvailable():/^private-ocr-(document|image)-(en|fr|ar)-investigation-v1$/.test(profile)&&investigationOcrProfilesAvailable();
}
