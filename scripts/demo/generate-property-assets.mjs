// Reproducible authored geometry; run in the Compose tests service (software WebGL).
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';
const out='assets/digitization-demo';fs.mkdirSync(out,{recursive:true});
const rooms=[
 {id:'living',label:'Living / dining',x:0,y:0,w:6,d:5,color:'#e6dbc8'},
 {id:'kitchen',label:'Kitchen',x:0,y:5,w:3,d:3,color:'#d6e2d9'},
 {id:'bathroom',label:'Bathroom',x:3,y:5,w:3,d:3,color:'#d2e2e8'},
 {id:'bedroom-one',label:'Bedroom one',x:6,y:0,w:4,d:4,color:'#e9dcd5'},
 {id:'bedroom-two',label:'Bedroom two',x:6,y:4,w:4,d:4,color:'#dbdbea'}
];
fs.writeFileSync(out+'/rooms.json',JSON.stringify(rooms,null,2)+'\n');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1100" viewBox="0 0 1200 1100"><rect width="1200" height="1100" fill="#faf8f3"/><g font-family="sans-serif" fill="#193d38"><text x="70" y="60" font-size="30" font-weight="bold">HAVEN DEMO 01 / TWO-BEDROOM APARTMENT</text><text x="70" y="95" font-size="18">Synthetic test property · authored dimensions · not a survey or title document</text>${rooms.map(r=>`<rect x="${100+r.x*100}" y="${150+r.y*100}" width="${r.w*100}" height="${r.d*100}" fill="${r.color}" stroke="#344c48" stroke-width="8"/><text x="${100+(r.x+r.w/2)*100}" y="${150+(r.y+r.d/2)*100-12}" text-anchor="middle" font-size="23">${r.label}</text><text x="${100+(r.x+r.w/2)*100}" y="${150+(r.y+r.d/2)*100+22}" text-anchor="middle" font-size="19">${r.w.toFixed(1)} × ${r.d.toFixed(1)} m / ${r.w*r.d} m²</text>`).join('')}<path d="M680 470h40 M680 590h40 M230 630v40 M530 630v40 M80 530h40" stroke="#faf8f3" stroke-width="90"/><path d="M100 125H1100 M75 150V950" stroke="#58756d" stroke-width="2"/><text x="600" y="140" text-anchor="middle" font-size="18">10.00 m authored envelope</text><text x="65" y="550" transform="rotate(-90 65 550)" text-anchor="middle" font-size="18">8.00 m authored envelope</text><text x="100" y="1000" font-size="21">80.00 m² schematic envelope · 2 bedrooms · 1 bathroom · ceiling 2.80 m</text><text x="100" y="1040" font-size="17">Room boundaries ignore wall thickness. Areas and heights are illustrative and unverified.</text><text x="100" y="1070" font-size="17">Five rendered 360° viewpoints link to the interactive plan and its extruded 3D room model.</text></g></svg>`;
fs.writeFileSync(out+'/floor-plan.svg',svg);
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1200,height:1100},deviceScaleFactor:1});
await page.route('http://demo-assets.test/**',async route=>{const file=new URL(route.request().url()).pathname.slice(1);if(['three.module.js','three.core.js'].includes(file))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join('packages/ui/node_modules/three/build',file))});return route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'});});
await page.goto('http://demo-assets.test/');
await page.setContent(svg);await page.addStyleTag({content:"body{margin:0}"});await page.screenshot({path:out+'/floor-plan.png'});
await page.setContent('<html><body style="margin:0"></body></html>');
for(const room of rooms){
 const images=await page.evaluate(async r=>{
  const THREE=await import('http://demo-assets.test/three.module.js');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#bddde5');scene.add(new THREE.HemisphereLight(0xffffff,0x776955,2.1));const sun=new THREE.DirectionalLight(0xfff4df,2.5);sun.position.set(3,6,4);scene.add(sun);
  const box=(x,y,z,w,h,d,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);scene.add(m);return m;};
  box(0,-.09,0,r.w,.18,r.d,0xb69a71);box(0,2.88,0,r.w,.16,r.d,0xf4f1e8);
  box(-r.w/2,1.4,0,.08,2.8,r.d,0xece7dc);box(r.w/2,1.4,0,.08,2.8,r.d,0xe4e2db);box(0,1.4,-r.d/2,r.w,2.8,.08,0xf1eee7);box(0,1.4,r.d/2,r.w,2.8,.08,0xe8e2d5);
  // Window and door are authored visible scene details, not inferred openings.
  box(0,1.75,-r.d/2+.06,Math.min(2,r.w-.6),1.3,.08,0x93c5d5);box(0,1.75,-r.d/2+.12,.04,1.3,.04,0xffffff);box(0,1.75,-r.d/2+.12,Math.min(2,r.w-.6),.04,.04,0xffffff);
  box(r.w/2-.07,1.05,.25,.05,2.1,.9,0xab815e);box(r.w/2-.12,1.05,.55,.07,.05,.06,0xd1b876);
  for(let x=-r.w/2+.12;x<r.w/2;x+=.24)box(x,.006,0,.008,.008,r.d,0x947e61);
  if(r.id==='living'){
   box(-1.8,.28,.6,1,.5,2.5,0xc5bca8);box(-2.2,.67,.6,.28,.8,2.5,0xd6cbb7);box(-1.75,.57,-.45,1,.24,.34,0xb99b80);box(-1.75,.57,1.65,1,.24,.34,0xb99b80);
   box(-.4,.018,.6,1.65,.025,2.8,0xe9e4d8);box(-.4,.35,.7,.85,.1,1.2,0x906b46);box(-.4,.16,.7,.5,.32,.8,0x866749);
   box(1.5,.8,-1.4,1.8,.1,1,0xbd976b);for(const x of [.8,2.2])for(const z of [-1.7,-1.1])box(x,.4,z,.07,.8,.07,0x4d5148);
   for(const x of [1,2]){box(x,.48,-.45,.45,.08,.42,0x728a76);box(x,.78,-.24,.45,.65,.07,0x728a76);}
   box(2.9,.7,1.4,.16,1,1.5,0x303c40);
  }else if(r.id.startsWith('bedroom')){
   box(-.75,.23,0,1.7,.45,2.1,0xaa8057);box(-.75,.51,0,1.75,.24,2.1,0xece5d6);box(-.75,.67,.2,1.72,.12,1.5,r.id==='bedroom-one'?0xa8bba8:0xa8b8cb);box(-.75,.7,-.75,1.3,.19,.4,0xffffff);box(-.75,.76,-1.14,1.8,1.15,.12,0x927457);box(1.4,1.1,1.65,.8,2.2,.55,0xd6c5ac);
  }else if(r.id==='kitchen'){
   for(const x of [-1,-.3,.4]){box(x,.45,-1.13,.68,.9,.6,0x91a28f);box(x,.94,-1.13,.7,.08,.64,0xf0e6cf);box(x,2.1,-1.25,.68,.7,.4,0xd9dccf);}
   box(.95,1,-1.13,.55,2,.6,0xc1c9c6);box(-1,.99,-1.13,.5,.02,.4,0x33423d);
  }else{
   box(-1,.45,-1,.75,.9,.6,0xc3aa87);box(-1,.94,-1,.8,.08,.65,0xffffff);box(-1,1.6,-1.42,.8,.8,.05,0x97bdc6);box(.85,.2,-.75,.9,.4,1.25,0xf6f7f3);box(.85,.65,-1.15,.65,.5,.2,0xf6f7f3);box(-.7,.18,1.1,1.2,.35,.65,0xe9edf0);
  }
  const cameraPosition=new THREE.Vector3(0,1.6,r.id==='living'?1.7:.6);
  const target=new THREE.WebGLCubeRenderTarget(512,{type:THREE.UnsignedByteType});const cube=new THREE.CubeCamera(.05,40,target);cube.position.copy(cameraPosition);cube.update(renderer,scene);
  const eq=new THREE.Scene();const material=new THREE.ShaderMaterial({uniforms:{map:{value:target.texture}},vertexShader:'varying vec2 uvp;void main(){uvp=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'precision highp float;uniform samplerCube map;varying vec2 uvp;void main(){float lon=(uvp.x-.5)*6.28318530718;float lat=(uvp.y-.5)*3.14159265359;vec3 dir=vec3(sin(lon)*cos(lat),sin(lat),-cos(lon)*cos(lat));gl_FragColor=textureCube(map,dir);#include <colorspace_fragment>\n}'});
  // Include directives must start on their own line for Three's shader preprocessor.
  material.fragmentShader=material.fragmentShader.replace(';#include',';\n#include');
  eq.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));renderer.setSize(2048,1024,false);renderer.render(eq,new THREE.Camera());const panorama=renderer.domElement.toDataURL('image/png').split(',')[1];
  renderer.setSize(1440,960,false);const camera=new THREE.PerspectiveCamera(75,1.5,.05,40);camera.position.copy(cameraPosition);camera.lookAt(0,1.15,-r.d/2);renderer.render(scene,camera);const photo=renderer.domElement.toDataURL('image/png').split(',')[1];
  target.dispose();renderer.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});material.dispose();return {panorama,photo};
 },room);
 for(const [kind,bytes] of Object.entries(images))fs.writeFileSync(`${out}/${room.id}-${kind}.png`,Buffer.from(bytes,'base64'));
 console.log('Rendered',room.label);
}
// A real text PDF with explicit synthetic provenance, suitable for document ingestion.
await page.setContent(`<html><body style="font:18px sans-serif;padding:45px;color:#193d38"><h1>HAVEN DEMO 01</h1><h2>SYNTHETIC PROPERTY TEST DOCUMENT</h2><p>This fictional apartment is a software test fixture. This is not a title deed, valuation, survey, ownership evidence or offer for sale.</p><hr/><p>Reference: DEMO-001</p><p>Area: 80.00 m2 (authored rectangular envelope, not measured)</p><p>Bedrooms: 2</p><p>Bathrooms: 1</p><p>Living rooms: 1</p><p>Authored envelope: 10.00 m x 8.00 m</p><p>Authored ceiling height: 2.80 m (unverified)</p><p>Price: CNY 1200000.00 (fictional test amount)</p><p>Five computer-rendered equirectangular room panoramas. Interior concept image generated with AI. Geometry manually authored; no reconstruction or real-property measurements.</p></body></html>`);
await page.pdf({path:out+'/property-test-document.pdf',format:'A4',printBackground:true});await browser.close();
console.log('Demo assets saved to',out);
