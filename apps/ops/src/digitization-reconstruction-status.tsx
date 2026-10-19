'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {sdk} from '@haven/contracts';
import {ErrorBox} from '@haven/ui';
type Status=Awaited<ReturnType<typeof sdk.DigitizationFrameController_reconstructionStatus>>['data'];
export function useReconstructionStatus(workspaceId:string){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),request=useRef(0);
 const refresh=useCallback(async()=>{
  const current=++request.current;
  try{const result=await sdk.DigitizationFrameController_reconstructionStatus({params:{id:workspaceId}});if(current===request.current){setStatus(result.data);setError('');}}
  catch(e){if(current===request.current){setStatus(null);setError(e instanceof Error?e.message:'Reconstruction status unavailable.');}}
 },[workspaceId]);
 useEffect(()=>{setStatus(null);void refresh();return()=>{request.current++;};},[refresh]);
 const cameraRunning=!!status?.camera&&['draft','queued','running','cancel_requested'].includes(status.camera.state),trainingRunning=!!status?.sceneTraining.job&&['draft','queued','running','cancel_requested'].includes(status.sceneTraining.job.state),running=cameraRunning||trainingRunning;
 const exported=status?.sceneTraining.job?.exportState==='succeeded'?status.sceneTraining.job.runId:null;
 useEffect(()=>{if(exported)window.dispatchEvent(new CustomEvent('digitization-scene-ready',{detail:workspaceId}));},[exported,workspaceId]);
 useEffect(()=>{
  if(!running)return;
  let active=true;let timer:ReturnType<typeof setTimeout>;
  // Wait for each read to finish before scheduling another; status reads never
  // recreate a job or reset the agent's unsaved privacy masks.
  const poll=async()=>{await refresh();if(active)timer=setTimeout(()=>void poll(),3000);};
  timer=setTimeout(()=>void poll(),1000);
  return()=>{active=false;clearTimeout(timer);request.current++;};
 },[running,refresh]);
 function queued(runId:string,inputRevision:number,workspaceVersion:number){
  request.current++;
  setStatus({inputRevision,workspaceVersion,cameraSolveAvailable:true,camera:{runId,state:'queued',stageState:'queued',report:null},sceneTraining:status?.sceneTraining??{available:false,reason:'GPU_VALIDATION_DEFERRED',job:null},publiclyServed:false});setError('');
 }
 function trainingQueued(runId:string){request.current++;setStatus(previous=>previous?{...previous,sceneTraining:{...previous.sceneTraining,job:{runId,state:'queued',trainingState:'queued',exportState:'pending',artifactIds:[]}}}:previous);setError('');}
 return {status,error,running,refresh,queued,trainingQueued};
}
export function ReconstructionStatus({status,error,refresh,workspaceId,onTrainingQueued}:{status:Status|null;error:string;refresh:()=>Promise<void>;workspaceId:string;onTrainingQueued:(runId:string)=>void}){
 const [submitting,setSubmitting]=useState(false),[trainingError,setTrainingError]=useState('');
 const camera=status?.camera,report=camera?.report,job=status?.sceneTraining.job;
 const active=!!job&&['draft','queued','running','cancel_requested'].includes(job.state);
 async function train(){if(!status||!report)return;setSubmitting(true);setTrainingError('');try{const result=await sdk.DigitizationFrameController_train({params:{id:workspaceId},body:{workspaceVersion:status.workspaceVersion,inputRevision:status.inputRevision,cameraReportId:report.artifactId},headers:{'Idempotency-Key':crypto.randomUUID()}});onTrainingQueued(result.data.id);}catch(e){setTrainingError(e instanceof Error?e.message:'Scene training could not start.');}finally{setSubmitting(false);}}
 const trainingText=!job?'Scene training has not run.':job.state==='cancel_requested'?'Stopping scene training…':job.state==='cancelled'?'Scene training cancelled.':job.state==='failed'?'Scene training failed. Review the captures and processing status before retrying.':job.exportState==='succeeded'?'Reconstructed scene ready for private review.':job.trainingState==='succeeded'?'Preparing private scene viewer files…':job.trainingState==='running'||job.trainingState==='leased'?'Training the captured property in the background…':'Scene training queued.';
 const cameraText=!status?'Loading reconstruction status…':!camera?'No camera reconstruction has been started for this source revision.':camera.state==='cancel_requested'?'Stopping camera reconstruction…':camera.state==='cancelled'?'Camera reconstruction cancelled.':camera.state==='failed'||camera.stageState==='failed_terminal'?'Camera reconstruction failed. Review the clips and processing status before retrying.':camera.stageState==='succeeded'?active?'Camera positions recovered.':report?.trainingArchiveAvailable?(job?'Camera positions recovered.':'Camera positions recovered. Scene training has not run.'):report?'Camera processing finished. More suitable overlapping views may be needed.':'Camera processing finished. No current camera report is available.':camera.stageState==='running'||camera.stageState==='leased'?'Recovering camera positions in the background…':'Camera reconstruction queued.';
 return <div aria-label="Property reconstruction status"><h3>Reconstruct the captured property</h3><p>Upload sharp photographs or short room clips at 1920 pixels or higher. Keep the same lens and lighting, move slowly with overlapping views, and capture both sides of every doorway. Prepare the views and inspect their privacy masks below. A floor plan or a single 360° image cannot supply unseen furniture or surfaces.</p>{error&&<ErrorBox message={error}/>}<p aria-live="polite">{cameraText}</p>{status&&!status.cameraSolveAvailable&&<p>Camera reconstruction is unavailable on this deployment.</p>}<div aria-label="Scene training"><p aria-live="polite">{trainingText}</p>{status&&!status.sceneTraining.available&&<p>Scene training is disabled pending GPU validation on this deployment.</p>}<p>Detailed reconstruction preserves larger capture views and adaptively adds surface detail. Allow up to 20 minutes each for camera recovery and GPU training. Scene reconstruction recovers visible appearance from overlapping captures. Missing surfaces, room coverage and scale require review. Individual editable furniture objects are not inferred.</p>{trainingError&&<ErrorBox message={trainingError}/>}<button disabled={!status?.sceneTraining.available||!report?.trainingArchiveAvailable||active||submitting||!!error} onClick={()=>void train()}>{submitting?'Starting scene training…':'Reconstruct captured property'}</button>{job?.exportState==='succeeded'&&<a href={'/ops/digitization?workspace='+encodeURIComponent(workspaceId)+'&view=scene'}>Review reconstructed scene</a>}</div><button onClick={()=>void refresh()}>Refresh reconstruction status</button>{report&&<div aria-label="Private camera report"><h4>Camera reconstruction</h4><p>Largest model: {report.registeredCameraCount} of {report.selectedFrameCount} views registered, with {report.pointCount} sparse points. Connected components across all models: {report.connectedComponentCount}.</p><p>{report.nextAction}</p><p>Scale is unverified. {report.trainingArchiveAvailable?'Private calibrated training inputs are available.':'Calibrated training inputs are not available yet.'} Privacy and room coverage still require review.</p></div>}</div>;
}
