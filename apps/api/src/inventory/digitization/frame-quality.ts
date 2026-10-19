import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {fail} from '../../platform/core.js';

export const frameQualityProfile={id:'private-frame-quality-v1',minimumLaplacianVariance:12,maximumDuplicateHammingDistance:2,maximumDuplicateBrightnessDifference:10,duplicateWindowSeconds:3} as const;
export type FrameQuality={sha256:string;laplacianVariance:number;brightnessMean:number;differenceHash:string;width:number;height:number};
/** Only bounded, canonical decoder-produced frame PNGs enter this private port.
 * These are actual pixel statistics, not geometric coverage or accuracy scores.
 */
export async function measureFrameQuality(body:Buffer):Promise<FrameQuality>{
 if(!body.length||body.length>16*1024*1024)fail(422,'The frame exceeds its analysis budget.','FRAME_QUALITY_INVALID');
 const image=sharp(body,{limitInputPixels:1600*1600,failOn:'warning'}),metadata=await image.metadata();
 if(metadata.format!=='png'||!metadata.width||!metadata.height||metadata.width>1600||metadata.height>1600||metadata.exif||metadata.xmp||metadata.iptc)fail(422,'Analyze only metadata-free bounded decoded frames.','FRAME_QUALITY_INVALID');
 const {data,info}=await image.clone().greyscale().resize({width:128,height:128,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
 let sum=0,squares=0,count=0,brightness=0;
 for(const pixel of data)brightness+=pixel;
 for(let y=1;y<info.height-1;y++)for(let x=1;x<info.width-1;x++){
  const offset=y*info.width+x,laplacian=data[offset-1]+data[offset+1]+data[offset-info.width]+data[offset+info.width]-4*data[offset];
  sum+=laplacian;squares+=laplacian*laplacian;count++;
 }
 if(!count||info.channels!==1)fail(422,'The frame is too small for quality analysis.','FRAME_QUALITY_INVALID');
 const hashPixels=await image.clone().greyscale().resize(9,8,{fit:'fill'}).raw().toBuffer();let bits=0n;
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits=(bits<<1n)|(hashPixels[y*9+x]>hashPixels[y*9+x+1]?1n:0n);
 return {sha256:createHash('sha256').update(body).digest('hex'),laplacianVariance:Math.max(0,squares/count-(sum/count)**2),brightnessMean:brightness/data.length,differenceHash:bits.toString(16).padStart(16,'0'),width:metadata.width,height:metadata.height};
}
export type QualityFrame={artifactId:string;cameraGroupId:string;roomId:string|null;transition:boolean;timestampSeconds:string;quality:FrameQuality};
function hamming(a:string,b:string){let bits=BigInt('0x'+a)^BigInt('0x'+b),count=0;while(bits){bits&=bits-1n;count++;}return count;}
/** Explicit transition/room annotations are supplied facts, never vision guesses.
 * Never merge different camera groups or let a duplicate hide a new room.
 */
export function selectQualityFrames(frames:readonly QualityFrame[]){
 if(!frames.length||frames.length>600||new Set(frames.map(frame=>frame.artifactId)).size!==frames.length)fail(422,'Select distinct bounded frame artifacts.','FRAME_DATASET_INVALID');
 const selected:QualityFrame[]=[],decisions:Array<{artifactId:string;selected:boolean;reason:string}>=[],lastTimes=new Map<string,number>(),groups=new Set<string>(),rooms=new Set<string>(),recapture:string[]=[];
 for(const frame of frames){
  const {quality:q}=frame,time=Number(frame.timestampSeconds);
  if(!/^[0-9]{1,3}(?:\.[0-9]{1,9})?(?:[eE][+-]?[0-9]{1,3})?$/.test(frame.timestampSeconds)||!Number.isFinite(time)||time<0||time>600||!frame.cameraGroupId||frame.cameraGroupId.length>100||frame.roomId!==null&&(!frame.roomId||frame.roomId.length>100)||typeof frame.transition!=='boolean'||!Number.isFinite(q.laplacianVariance)||q.laplacianVariance<0||!Number.isFinite(q.brightnessMean)||q.brightnessMean<0||q.brightnessMean>255||!/^[a-f0-9]{16}$/.test(q.differenceHash)||!/^[a-f0-9]{64}$/.test(q.sha256)||time<(lastTimes.get(frame.cameraGroupId)??-1))fail(422,'Frame provenance or measured quality is invalid.','FRAME_DATASET_INVALID');
  lastTimes.set(frame.cameraGroupId,time);groups.add(frame.cameraGroupId);
  const roomKey=frame.cameraGroupId+':'+frame.roomId;
  if(q.laplacianVariance<frameQualityProfile.minimumLaplacianVariance){decisions.push({artifactId:frame.artifactId,selected:false,reason:'gross_blur'});if(frame.transition)recapture.push(frame.artifactId);continue;}
  const duplicate=selected.slice().reverse().find(previous=>previous.cameraGroupId===frame.cameraGroupId&&previous.roomId===frame.roomId&&time-Number(previous.timestampSeconds)<=frameQualityProfile.duplicateWindowSeconds&&(previous.quality.sha256===q.sha256||Math.abs(previous.quality.brightnessMean-q.brightnessMean)<=frameQualityProfile.maximumDuplicateBrightnessDifference&&hamming(previous.quality.differenceHash,q.differenceHash)<=frameQualityProfile.maximumDuplicateHammingDistance));
  if(duplicate&&!frame.transition&&rooms.has(roomKey)){decisions.push({artifactId:frame.artifactId,selected:false,reason:'near_duplicate'});continue;}
  selected.push(frame);rooms.add(roomKey);decisions.push({artifactId:frame.artifactId,selected:true,reason:frame.transition?'supplied_transition':duplicate?'new_room_or_camera_group':'diverse_sharp_frame'});
 }
 return {profile:frameQualityProfile,selectedArtifactIds:selected.map(frame=>frame.artifactId),decisions,sourceFrameCount:frames.length,selectedFrameCount:selected.length,excludedFrameCount:frames.length-selected.length,recaptureTransitionArtifactIds:recapture,cameraGroupsWithoutSelectedFrames:[...groups].filter(group=>!selected.some(frame=>frame.cameraGroupId===group)),reviewRequired:true as const,geometricCoverage:null,thresholdBasis:'versioned_advisory_synthetic_checks_not_country_calibrated' as const};
}
