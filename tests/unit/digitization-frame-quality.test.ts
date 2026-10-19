import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
import {measureFrameQuality,selectQualityFrames,type QualityFrame} from '../../apps/api/src/inventory/digitization/frame-quality';
import {digitizationRenderReceipt} from '../../packages/contracts/src/digitization-worker';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url)),sharp=requireApi('sharp');
async function pixels(){
 const raw=Buffer.alloc(128*128*3);for(let y=0;y<128;y++)for(let x=0;x<128;x++)for(let c=0;c<3;c++)raw[(y*128+x)*3+c]=((Math.floor(x/4)+Math.floor(y/4))%2)*255;
 return sharp(raw,{raw:{width:128,height:128,channels:3}});
}
it('HE-F03 measured pixels reject gross blur and duplicates while preserving supplied doorway sequence and camera groups',async()=>{
 const image=await pixels(),sharpQuality=await measureFrameQuality(await image.clone().png().toBuffer()),blurQuality=await measureFrameQuality(await image.clone().blur(12).png().toBuffer());
 expect(sharpQuality.laplacianVariance).toBeGreaterThan(12);expect(blurQuality.laplacianVariance).toBeLessThan(12);
 const frame=(id:string,time:string,quality=sharpQuality,transition=false,group='clip-a',room:string|null='room-a'):QualityFrame=>({artifactId:id,timestampSeconds:time,quality,transition,cameraGroupId:group,roomId:room});
 const report=selectQualityFrames([frame('sharp','0'),frame('duplicate','1'),frame('blur','2',blurQuality),frame('doorway-entry','3',sharpQuality,true),frame('doorway-exit','4',sharpQuality,true,'clip-a','room-b'),frame('other-camera','0',sharpQuality,false,'clip-b','room-a')]);
 expect(report.selectedArtifactIds).toEqual(['sharp','doorway-entry','doorway-exit','other-camera']);expect(report.decisions).toContainEqual({artifactId:'duplicate',selected:false,reason:'near_duplicate'});expect(report.decisions).toContainEqual({artifactId:'blur',selected:false,reason:'gross_blur'});expect(report.geometricCoverage).toBeNull();expect(report.cameraGroupsWithoutSelectedFrames).toEqual([]);expect(report.reviewRequired).toBe(true);
 const recapture=selectQualityFrames([frame('blurred-doorway','0',blurQuality,true)]);expect(recapture.selectedArtifactIds).toEqual([]);expect(recapture.recaptureTransitionArtifactIds).toEqual(['blurred-doorway']);expect(recapture.cameraGroupsWithoutSelectedFrames).toEqual(['clip-a']);
});
it('private frame quality rejects noncanonical metadata and invalid chronological provenance',async()=>{
 const image=await pixels();await expect(measureFrameQuality(await image.clone().jpeg().toBuffer())).rejects.toMatchObject({status:422});await expect(measureFrameQuality(await image.clone().withExif({IFD0:{ImageDescription:'private metadata'}}).png().toBuffer())).rejects.toMatchObject({status:422});
 const q=await measureFrameQuality(await image.png().toBuffer()),f:QualityFrame={artifactId:'first',cameraGroupId:'clip',roomId:null,transition:false,timestampSeconds:'2',quality:q};expect(()=>selectQualityFrames([f,{...f,artifactId:'second',timestampSeconds:'1'}])).toThrow();expect(()=>selectQualityFrames([f,f])).toThrow();
});
it('frame artifact receipts accept the bounded frame profile rather than the document-only fifty-page count',()=>{
 const ids=Array.from({length:51},()=>crypto.randomUUID());expect(digitizationRenderReceipt.parse({executionId:crypto.randomUUID(),state:'succeeded',artifactIds:ids}).artifactIds).toHaveLength(51);expect(digitizationRenderReceipt.safeParse({executionId:crypto.randomUUID(),state:'succeeded',artifactIds:Array.from({length:601},()=>crypto.randomUUID())}).success).toBe(false);
});
