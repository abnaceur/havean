import {event,type Actor} from '@haven/database';
import {fail,transaction} from '../../platform/core.js';
import {checkedCapture} from './capture.js';
import {requireDigitizationAgency} from './intakes.js';
import {captureStorage,completeCaptureMultipart} from './multipart.js';
import {verifyCaptureContent} from './capture-content.js';

export async function finalizeCapture(a:Actor,engine:string,id:string,version:number,checksum:string){
 const snapshot=await transaction(a,async c=>{
  await requireDigitizationAgency(c,a);const capture=await checkedCapture(c,a,engine,id);
  if(capture.state==='complete'){
   const receipt=(await c.query('SELECT checksum FROM digitization_capture_receipts WHERE capture_id=$1',[id])).rows[0];
   if(!receipt||receipt.checksum!==checksum)fail(409,'The capture completion differs from this request.','CAPTURE_COMPLETION_CONFLICT');
   return capture;
  }
  if(capture.version!==version)fail(409,'The capture upload changed.','VERSION_CONFLICT');
  if(capture.state!=='uploading'||capture.expiresAt<=new Date())fail(409,'The capture upload cannot complete.','CAPTURE_NOT_COMPLETABLE');
  return capture;
 });
 if(snapshot.state==='complete')return {id,digitizationId:engine,version:snapshot.version,status:'quarantined' as const,checksum,bytes:Number(snapshot.expectedBytes),processingEligible:false as const};
 const storage=captureStorage(),signal=AbortSignal.timeout(120000);
 try{
  try{await completeCaptureMultipart(storage,snapshot.objectKey,snapshot.uploadId,Number(snapshot.expectedBytes),signal);}
  catch(error:any){if(error.name!=='NoSuchUpload')throw error;} // A prior completed transfer may have lost its DB commit.
  const verified=await verifyCaptureContent(storage,snapshot.objectKey,Number(snapshot.expectedBytes),snapshot.mime,checksum,signal);
  return transaction(a,async c=>{
   await requireDigitizationAgency(c,a);const current=await checkedCapture(c,a,engine,id,version);
   if(current.state!=='uploading'||current.expiresAt<=new Date())fail(409,'Capture completion was superseded or cancelled.','CAPTURE_NOT_COMPLETABLE');
   await c.query("UPDATE digitization_capture_uploads SET state='complete',version=version+1 WHERE id=$1",[id]);
   await c.query(`INSERT INTO digitization_capture_receipts(digitization_id,organization_id,created_by,capture_id,checksum,byte_size,detected_mime) VALUES($1,$2,$3,$4,$5,$6,$7)`,[engine,a.orgId,a.id,id,verified.checksum,verified.bytes,verified.detectedMime]);
   await event(c,a,engine,'digitization.capture_quarantined',{captureUploadId:id,version:version+1});
   await c.query("INSERT INTO digitization_events(digitization_id,organization_id,created_by,kind,state) VALUES($1,$2,$3,'digitization.capture_quarantined','quarantined')",[engine,a.orgId,a.id]);
   return {id,digitizationId:engine,version:version+1,status:'quarantined' as const,checksum:verified.checksum,bytes:verified.bytes,processingEligible:false as const};
  });
 }finally{storage.destroy();}
}
