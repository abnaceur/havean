import {digitizationCapturePreviewView} from '@haven/contracts';

/** Read only canonical text members from the checksummed training archive.
 * Never extract archive paths or use the authored capture generator's poses. */
export function capturePreviewFromArchive(body:Buffer,preferredFrame?:string){
 if(body.length>384*1024*1024)return null;
 const texts=new Map<string,string>();let entries=0;
 for(let offset=0;offset+512<=body.length;){
  const header=body.subarray(offset,offset+512);if(header.every(v=>v===0))break;
  const name=header.subarray(0,100).toString().replace(/\0.*$/s,''),rawSize=header.subarray(124,136).toString().replace(/\0/g,'').trim();
  if(!/^[0-7]+$/.test(rawSize)||header[156]!==48||++entries>604)return null;
  const size=parseInt(rawSize,8),end=offset+512+size;if(!Number.isSafeInteger(size)||end>body.length)return null;
  if(['manifest.json','sparse/cameras.txt','sparse/images.txt'].includes(name)){
   if(size>32*1024*1024||texts.has(name))return null;texts.set(name,body.subarray(offset+512,end).toString('utf8'));
  }
  offset+=512+Math.ceil(size/512)*512;
 }
 try{
  const manifest=JSON.parse(texts.get('manifest.json')??''),allowed=new Set(manifest.frames.map((f:any)=>f.name));
  const cameraCalibrationGroups:Record<string,any>={},cameraPoses:Record<string,any>={};
  for(const line of (texts.get('sparse/cameras.txt')??'').split('\n').filter(l=>l&&!l.startsWith('#'))){const [id,model,width,height,...params]=line.trim().split(/\s+/);cameraCalibrationGroups[id]={model,width:Number(width),height:Number(height),parameters:params.map(Number)};}
  const lines=(texts.get('sparse/images.txt')??'').trimEnd().split('\n').filter(l=>!l.startsWith('#'));
  for(let i=0;i<lines.length;i+=2){const w=lines[i].trim().split(/\s+/);if(w.length!==10||!allowed.has(w[9])||!lines[i+1])continue;cameraPoses[w[0]]={name:w[9],worldToCameraQuaternion:w.slice(1,5).map(Number),worldToCameraTranslation:w.slice(5,8).map(Number),cameraId:w[8],observationCount:lines[i+1].trim().split(/\s+/).filter((v,j)=>j%3===2&&v!=='-1').length};}
  return capturePreviewView({models:[{connectedComponentCount:1,advisoryQualityPassed:true,cameraCalibrationGroups,cameraPoses}]},preferredFrame);
 }catch{return null;}
}

/** Inspection framing from an actual recovered camera, never floor registration
 * or approved navigation. COLMAP stores world-to-camera R,t with Y down. */
export function capturePreviewView(report:any,preferredFrame?:string){
 const models=report?.models;if(!Array.isArray(models)||models.length!==1||models[0].connectedComponentCount!==1||!models[0].advisoryQualityPassed)return null;
 const model=models[0],poses=Object.values(model.cameraPoses??{}) as any[];
 for(const pose of poses.sort((a,b)=>Number(b.name===preferredFrame)-Number(a.name===preferredFrame)||(b.observationCount??0)-(a.observationCount??0))){
  const q=pose.worldToCameraQuaternion,t=pose.worldToCameraTranslation,c=model.cameraCalibrationGroups?.[pose.cameraId];
  if(!Array.isArray(q)||q.length!==4||!Array.isArray(t)||t.length!==3||![...q,...t].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e6)||Math.abs(q.reduce((s,v)=>s+v*v,0)-1)>.001||!c)continue;
  const [w,x,y,z]=q,r=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
  const focal=c.model==='PINHOLE'?c.parameters?.[1]:['SIMPLE_PINHOLE','SIMPLE_RADIAL','RADIAL'].includes(c.model)?c.parameters?.[0]:null;
  if(typeof focal!=='number'||focal<=0||!Number.isFinite(focal)||typeof c.height!=='number'||c.height<=0||typeof c.width!=='number'||c.width<=0)continue;
  const result=digitizationCapturePreviewView.safeParse({position:[0,1,2].map(i=>-r.reduce((s,row,j)=>s+row[i]*t[j],0)),forward:r[2],up:r[1].map(v=>-v),verticalFov:Math.min(110,Math.max(20,2*Math.atan(c.height/(2*focal))*180/Math.PI)),aspectRatio:c.width/c.height,basis:'recovered_capture_unverified'});
  if(result.success)return result.data;
 }
 return null;
}

/** Compact calibrated poses emitted from the verified undistorted dataset.
 * They are capture inspection positions, never floor registration approval. */
export function calibratedCapturePreview(camera:any){
 const r=camera?.viewMatrix,k=camera?.intrinsics;if(!Array.isArray(r)||r.length!==16||!Array.isArray(k)||k.length!==4||r.some(v=>!Number.isFinite(v))||r[12]!==0||r[13]!==0||r[14]!==0||r[15]!==1)return null;
 const rows=[r.slice(0,3),r.slice(4,7),r.slice(8,11)],t=[r[3],r[7],r[11]];
 if(rows.some(row=>Math.abs(Math.hypot(...row)-1)>.001)||Math.abs(rows[0].reduce((s,v,i)=>s+v*rows[1][i],0))>.001)return null;
 const result=digitizationCapturePreviewView.safeParse({position:[0,1,2].map(i=>-rows.reduce((s,row,j)=>s+row[i]*t[j],0)),forward:rows[2],up:rows[1].map(v=>-v),verticalFov:2*Math.atan(camera.height/(2*k[1]))*180/Math.PI,aspectRatio:camera.width/camera.height,basis:'recovered_capture_unverified'});
 return result.success?result.data:null;
}
