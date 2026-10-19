// Run inside the Compose API container, whose FFmpeg version is pinned.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const source='infra/generated/reconstruction/tum-xyz-input',output='infra/generated/reconstruction/queued-camera-input';
const manifest=JSON.parse(fs.readFileSync(source+'/manifest.json','utf8'));
if(!Array.isArray(manifest.frames)||manifest.frames.length!==16||manifest.frames.some(frame=>!/^frames\/[a-f0-9-]{36}\.png$/.test(frame.name)))throw Error('Retained sixteen-frame licensed reference fixture required');
fs.mkdirSync(output,{recursive:true});
manifest.frames.forEach((frame,index)=>fs.copyFileSync(source+'/'+frame.name,output+'/frame'+String(index).padStart(3,'0')+'.png'));
execFileSync('ffmpeg',['-v','error','-framerate','1','-i',output+'/frame%03d.png','-frames:v','16','-c:v','libx264','-crf','12','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart','-y',output+'/reference.mp4'],{timeout:30000});
console.log(JSON.stringify({inputFrames:16,videoBytes:fs.statSync(output+'/reference.mp4').size,provenance:'Licensed retained TUM reference frames; authored one-fps clip for workflow validation, not a physical-property benchmark'}));
