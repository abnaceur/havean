import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test,expect} from '@playwright/test';
const require=createRequire(new URL('../../packages/ui/package.json',import.meta.url));
test('generate coherent furnished studio capture pixels',async({page})=>{
 test.skip(process.env.RECONSTRUCT_PROPERTY_DEMO!=='true','Opt-in generated local property demonstration.');
 test.setTimeout(240000);const root=path.resolve(path.dirname(require.resolve('three')),'..'),out='assets/digitization-property-capture';fs.mkdirSync(out,{recursive:true});
 await page.route('**/__three/**',route=>{const file=path.resolve(root,new URL(route.request().url()).pathname.split('/__three/')[1]);return file.startsWith(root+'/')?route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file)}):route.abort();});
 await page.route('**/__property-scene.mjs',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('scripts/demo/property-capture-scene.mjs')}));
 await page.route('**/__property-capture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"/__three/build/three.module.js"}}</script><script type="module" src="/__property-scene.mjs"></script>'}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8088/__property-capture');await expect.poll(()=>page.evaluate(()=>(window as any).ready)).toBe(true);
 for(let i=0;i<48;i++){const data=await page.evaluate(i=>(window as any).renderCapture(i),i);fs.writeFileSync(`${out}/frame${String(i).padStart(3,'0')}.png`,Buffer.from(data.split(',')[1],'base64'));}expect(errors).toEqual([]);
 fs.writeFileSync(out+'/provenance.json',JSON.stringify({label:'P',origin:'Original procedurally rendered synthetic furnished studio apartment',captureViews:48,width:640,height:480,areas:['living','dining','kitchen','sleeping'],reconstructionInputs:'Only rendered pixels. No authored geometry, supplied poses, depths or manual floor plan are passed to COLMAP or gsplat.',realProperty:false,walkthrough:'studio-walkthrough.mp4',reconstructionClips:[0,1,2,3].map(i=>`part-${i}.mp4`),clipSeconds:12,encoder:'mwader/static-ffmpeg:7.1.1'},null,2));
});
