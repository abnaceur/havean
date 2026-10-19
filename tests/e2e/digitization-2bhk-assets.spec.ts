import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test,expect} from '@playwright/test';
const require=createRequire(new URL('../../packages/ui/package.json',import.meta.url));
test('generate high-resolution furnished two-bedroom capture pixels',async({page})=>{
 test.skip(process.env.RECONSTRUCT_2BHK_DEMO!=='true','Opt-in generated local property demonstration.');
 test.setTimeout(600000);const root=path.resolve(path.dirname(require.resolve('three')),'..'),out='assets/digitization-2bhk';fs.mkdirSync(out,{recursive:true});
 await page.route('**/__three/**',route=>{const file=path.resolve(root,new URL(route.request().url()).pathname.split('/__three/')[1]);return file.startsWith(root+'/')?route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file)}):route.abort();});
 await page.route('**/__property-scene.mjs',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('scripts/demo/two-bedroom-capture.mjs')}));
 await page.route('**/__property-capture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script><script type="module" src="/__property-scene.mjs"></script>'}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8088/__property-capture');await expect.poll(()=>page.evaluate(()=>(window as any).ready)).toBe(true);
 const manifest=await page.evaluate(()=>(window as any).captureManifest);
 for(let i=Number(process.env.CAPTURE_START??0);i<manifest.count;i++){const data=await page.evaluate(i=>(window as any).renderCapture(i),i);fs.writeFileSync(`${out}/frame${String(i).padStart(3,'0')}.png`,Buffer.from(data.split(',')[1],'base64'));}expect(errors).toEqual([]);
 fs.writeFileSync(out+'/provenance.json',JSON.stringify({label:'P',origin:'Original synthetic furnished two-bedroom apartment',captureViews:manifest.count,width:manifest.width,height:manifest.height,areas:['living','dining','kitchen','bedroom_1','bedroom_2','hall','bathroom'],viewRooms:manifest.rooms,reconstructionInputs:'Only rendered pixels. No authored geometry, supplied poses, depths or manual floor plan are passed to COLMAP or gsplat.',realProperty:false,reconstructionClips:Array.from({length:manifest.count/12},(_,i)=>`part-${i}.mp4`),clipSeconds:12,encoder:'mwader/static-ffmpeg:7.1.1'},null,2));
});
