import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const sharp=require('sharp');
const dir='packages/test-support/assets';
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','2','-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart','-y',dir+'/property-demo.mp4'],{timeout:15000});
const plan='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#f9fbf6"/><text x="60" y="70" font-family="sans-serif" font-size="30">Illustrative test plan — not measured</text><g stroke="#235f45" stroke-width="10" fill="#eaf2e5"><rect x="80" y="140" width="1040" height="650"/><rect x="80" y="140" width="420" height="350"/><rect x="500" y="140" width="350" height="350"/><rect x="850" y="140" width="270" height="350"/></g><g font-family="sans-serif" font-size="28" fill="#235f45"><text x="180" y="320">Bedroom 1</text><text x="570" y="320">Bedroom 2</text><text x="900" y="320">Kitchen</text><text x="400" y="650">Living / dining</text><text x="80" y="850">Synthetic fixture. No real property or dimensions represented.</text></g></svg>';
fs.writeFileSync(dir+'/property-plan.svg',plan);await sharp(Buffer.from(plan)).png().toFile(dir+'/property-plan.png');
for(const [key,title,color] of [['living','Living room','#dce7d2'],['bedroom','Bedroom','#eadbc7']]){
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024"><rect width="2048" height="1024" fill="${color}"/><rect width="2048" height="220" fill="#f9fbf6"/><rect y="780" width="2048" height="244" fill="#9aab8d"/><g stroke="#7b8c71" stroke-width="8"><path d="M0 220H2048M0 780H2048M256 220V780M768 220V780M1280 220V780M1792 220V780"/></g><g fill="#235f45" font-family="sans-serif" text-anchor="middle" font-size="42"><text x="1024" y="470">${title} · Synthetic 360° fixture</text><text x="1024" y="550" font-size="28">Illustrative panorama. No real property represented.</text></g></svg>`;
fs.writeFileSync(dir+'/panorama-'+key+'.svg',svg);await sharp(Buffer.from(svg)).png().toFile(dir+'/panorama-'+key+'.png');
}
fs.writeFileSync(dir+'/rich-media-provenance.json',JSON.stringify({kind:'synthetic',source:'Generated in this repository using SVG and FFmpeg testsrc2',rights:'No third-party property media used',files:['property-demo.mp4','property-plan.svg','property-plan.png','panorama-living.svg','panorama-living.png','panorama-bedroom.svg','panorama-bedroom.png'],notice:'Illustrative test assets only. No real property or measured layout represented.'},null,2));
console.log('Synthetic video, plan and panorama fixtures generated.');
