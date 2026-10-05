import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {fail} from '../platform/core.js';
const run=promisify(execFile);
let processing=0;
export async function transcodeVideo(input:Buffer,mime:string){
 if(processing>=2)fail(429,'Video processing is busy. Please try again shortly.','MEDIA_BUSY');
 processing++;
 const directory=await mkdtemp(path.join(tmpdir(),'haven-video-'));
 try{
  const source=path.join(directory,mime==='video/mp4'?'source.mp4':'source.webm'),target=path.join(directory,'video.mp4'),poster=path.join(directory,'poster.png');
  await writeFile(source,input);
  const {stdout}=await run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',source],{timeout:15000,maxBuffer:1024*1024});
  const info=JSON.parse(stdout),stream=info.streams?.find((s:any)=>s.codec_type==='video');
  const duration=Number(info.format?.duration),formats=String(info.format?.format_name||'');
  if(!stream||!Number.isFinite(duration)||duration<=0||duration>90||stream.width>4096||stream.height>4096||stream.width<64||stream.height<64||(mime==='video/mp4'?!formats.includes('mp4'):!formats.includes('webm')))fail(400,'Upload a valid MP4 or WebM video up to 90 seconds and 4096 pixels per side');
  await run('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',source,'-map','0:v:0','-map','0:a:0?','-vf',"scale='min(1280,iw)':-2",'-c:v','libx264','-threads','2','-preset','fast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-map_metadata','-1','-movflags','+faststart','-y',target],{timeout:100000,maxBuffer:1024*1024});
  await run('ffmpeg',['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',target,'-frames:v','1','-y',poster],{timeout:15000,maxBuffer:1024*1024});
  return {video:await readFile(target),poster:await sharp(await readFile(poster)).resize({width:800,withoutEnlargement:true}).webp().toBuffer(),duration,width:stream.width,height:stream.height};
 }catch(error:any){if(error.getStatus)throw error;fail(400,'This file could not be decoded as a supported video');}
 finally{processing--;await rm(directory,{recursive:true,force:true});}
}
