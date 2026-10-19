import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash=/^[a-f0-9]{64}$/;
export function validateOcrRelease(root=process.cwd(),{verifyCache=false}={}){
 const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
 const file='services/property-processing/ocr-production-release.json',body=fs.readFileSync(path.join(root,file)),release=JSON.parse(body);
 const check=record=>{
  if(!record||!hash.test(record.sha256)||typeof record.path!=='string')throw Error('OCR_RELEASE_RECORD_INVALID');
  const resolved=fs.realpathSync(path.join(root,record.path)),relative=path.relative(fs.realpathSync(root),resolved);
  if(relative.startsWith('..')||path.isAbsolute(relative)||createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')!==record.sha256)throw Error('OCR_RELEASE_FILE_MISMATCH:'+record.path);
 };
 if(release.schemaVersion!==1||release.id!=='paddleocr-3.3.3-offline-cpu-v1'||release.enabled!==true||release.runtimeDownloads!==false||release.platform!=='linux/amd64'||release.distributionReview?.status!=='complete')throw Error('OCR_RELEASE_NOT_ADMITTED');
 check({path:release.distributionReview.document,sha256:release.distributionReview.documentSha256});
 for(const record of [release.buildPins,release.wheelNotices,release.nativeLinkage,release.nativeInventory])check(record);
 const pins=read(release.buildPins.path),notices=read(release.wheelNotices.path),audit=read(release.nativeInventory.path);
 if(JSON.stringify(release.packages)!==JSON.stringify(Object.fromEntries(Object.entries(pins.packages).map(([name,record])=>[name,record.version])))||JSON.stringify(release.models)!==JSON.stringify(pins.models)||audit.unresolvedSystemDependencies.length)throw Error('OCR_RELEASE_PIN_INVENTORY_MISMATCH');
 const expected=new Map(audit.libraries.map(item=>[(item.root==='site-packages'?'/usr/local/lib/python3.12/site-packages/':'/opt/ocr-models/native/')+item.path,item.sha256]));
 for(const item of audit.systemLibraries)expected.set(item.path,item.sha256);
 for(const [name,model] of Object.entries(pins.models)){
  if(model.license!=='apache-2.0'||!model.artifacts['README.md'])throw Error('OCR_MODEL_NOTICE_REQUIRED');
  for(const [nameOfFile,artifact] of Object.entries(model.artifacts))expected.set('/opt/ocr-models/'+name+'/'+nameOfFile,artifact.sha256);
 }
 const actual=new Map();
 for(const item of release.runtimeFiles){
  if(actual.has(item.path)||!hash.test(item.sha256)||!/^\/[a-zA-Z0-9_+./-]+$/.test(item.path)||item.path.split('/').includes('..')||!/^[1-9]\d*$/.test(item.byteSize)||BigInt(item.byteSize)>1073741824n)throw Error('OCR_RUNTIME_FILE_INVALID');
  actual.set(item.path,item.sha256);
 }
 if(actual.size!==expected.size+2||[...expected].some(([name,sha])=>actual.get(name)!==sha)||!actual.has('/opt/ocr-models/pins.json')||!actual.has('/opt/ocr-models/native/pins.json'))throw Error('OCR_RUNTIME_INVENTORY_INCOMPLETE');
 const retained=new Set();
 for(const notice of release.notices){check(notice);if(retained.has(notice.path))throw Error('OCR_NOTICE_DUPLICATE');retained.add(notice.path);}
 for(const pkg of Object.values(notices.packages))for(const notice of pkg.notices)if(!retained.has(notice.path))throw Error('OCR_WHEEL_NOTICE_MISSING');
 const ids=new Set(),sources=new Set(),hosts=new Set(['files.pythonhosted.org','codeload.github.com','gitlab.com','download.qt.io','download.osgeo.org','ffmpeg.org','deb.debian.org','vault.centos.org','paddlepaddledeps.bj.bcebos.com']);
 for(const item of release.sourceArtifacts){
  const url=new URL(item.url);
  if(url.protocol!=='https:'||url.username||url.password||!hosts.has(url.hostname)||!hash.test(item.sha256)||!/^[1-9]\d*$/.test(item.byteSize)||BigInt(item.byteSize)>268435456n||path.basename(item.cacheFile)!==item.cacheFile||!/^[a-zA-Z0-9_.+~-]+$/.test(item.cacheFile)||ids.has(item.id)||sources.has(item.cacheFile))throw Error('OCR_SOURCE_ARTIFACT_INVALID');
  ids.add(item.id);sources.add(item.cacheFile);
  if(verifyCache)check({path:'services/property-processing/.ocr-sources/'+item.cacheFile,sha256:item.sha256});
 }
 for(const id of ['paddle-3.2.2','paddle-eigen3','paddle-openvino','paddle-onednn','paddle-pocketfft','onetbb-2021.13.0','qtbase-5.15.13','ffmpeg-5.1.4','geos-3.14.1','crc32c','python-bidi','certifi','glib-source-0','centos-libquadmath','gcc-4.8.5-source','intel-mklml-original','ffmpeg-media-7.1.5','media-glibc-source-0'])if(!ids.has(id))throw Error('OCR_CORRESPONDING_SOURCE_MISSING:'+id);
 const linkage=read(release.nativeLinkage.path);
 if(linkage.nativeReplacementMatches.length!==13)throw Error('OCR_NATIVE_LINKAGE_INCOMPLETE');
 for(const item of linkage.nativeReplacementMatches)if(pins.nativeLibraries[item.file]?.sha256!==item.sha256||!ids.has('debian-'+item.package)||!retained.has(item.notice.path))throw Error('OCR_NATIVE_LINKAGE_MISMATCH');
 return {releaseSha256:createHash('sha256').update(body).digest('hex'),packages:Object.keys(release.packages).length,models:Object.keys(release.models).length,runtimeFiles:actual.size,notices:retained.size,sourceArchives:sources.size};
}
