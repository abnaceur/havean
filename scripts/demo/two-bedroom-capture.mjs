// Original synthetic two-bedroom property. Only rendered RGB capture pixels
// may be uploaded: these meshes, dimensions and poses are NOT reconstruction data.
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
let seed=261013;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const scene=new T.Scene();scene.background=new T.Color('#dce7ed');
function surface(base,kind='plaster'){
 const c=document.createElement('canvas');c.width=c.height=1024;const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,1024,1024);
 for(let i=0;i<28000;i++){g.fillStyle=`rgba(${rnd()>.5?'255,255,255':'35,25,18'},${.03+rnd()*(kind==='wood'?.19:.09)})`;g.fillRect(rnd()*1024,rnd()*1024,kind==='wood'?5+rnd()*90:1+rnd()*3,kind==='wood'?.6:1+rnd()*2);}
 if(kind==='wood')for(let y=0;y<1024;y+=128){g.fillStyle='#70584088';g.fillRect(0,y,1024,2);for(let x=(y%256)*2;x<1024;x+=512)g.fillRect(x,y,2,128);}
 if(kind==='weave')for(let i=0;i<1024;i+=4){g.fillStyle='#594b3720';g.fillRect(i,0,1,1024);g.fillRect(0,i,1024,1);}
 if(kind==='rug')for(let y=0;y<1024;y+=64)for(let x=0;x<1024;x+=64){g.strokeStyle=['#aa896b','#ccb79a','#727970'][Math.floor(rnd()*3)];g.lineWidth=4;g.strokeRect(x+10,y+10,44,44);g.beginPath();g.moveTo(x+14,y+14);g.lineTo(x+50,y+50);g.stroke();}
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=8;return new T.MeshStandardMaterial({map,roughness:kind==='wood'?.65:.92});
}
const oak=surface('#b68a5c','wood'),paleOak=surface('#d5b990','wood'),walnut=surface('#775139','wood'),cream=surface('#e3dbcc','weave'),white=surface('#eeeae2','weave'),green=surface('#627665','weave'),blue=surface('#657987','weave'),clay=surface('#b98265','weave'),wall=surface('#e3ded3'),metal=new T.MeshStandardMaterial({color:'#3c4240',metalness:.6,roughness:.36}),brass=new T.MeshStandardMaterial({color:'#b09057',metalness:.7,roughness:.3});
function box(x,y,z,w,h,d,m=oak,round=0){const mesh=new T.Mesh(round?new RoundedBoxGeometry(w,h,d,3,Math.min(round,w/3,h/3,d/3)):new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;}
function cyl(x,y,z,r,h,m=oak,r2=r){const o=new T.Mesh(new T.CylinderGeometry(r,r2,h,32),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;scene.add(o);return o;}
function ellipsoid(x,y,z,sx,sy,sz,m){const o=new T.Mesh(new T.SphereGeometry(1,24,16),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=o.receiveShadow=true;scene.add(o);return o;}
function plant(x,z,height=1.6){cyl(x,.23,z,.20,.46,clay,.15);cyl(x,height*.48,z,.025,height*.8,walnut);for(let i=0;i<27;i++){const a=i*2.4,r=.15+rnd()*.28;const leaf=ellipsoid(x+Math.sin(a)*r,height*.40+rnd()*height*.62,z+Math.cos(a)*r,.12,.27,.035,i%3?green:blue);leaf.rotation.set(.3,a,.3*Math.sin(a));}}
function art(x,y,z,w,h,angle=0){const c=document.createElement('canvas');c.width=1024;c.height=768;const g=c.getContext('2d');g.fillStyle='#dbd0b6';g.fillRect(0,0,1024,768);for(let i=0;i<65;i++){g.fillStyle=['#335e61','#ad6e44','#788357','#d6b073','#55493e','#b7bdb3'][i%6];g.beginPath();g.ellipse(rnd()*1024,rnd()*768,15+rnd()*150,10+rnd()*180,rnd()*3,0,7);g.fill();}const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const frame=box(x,y,z,w+.06,h+.06,.055,walnut);frame.rotation.y=angle;const paint=box(x+Math.sin(angle)*.032,y,z+Math.cos(angle)*.032,w,h,.008,new T.MeshStandardMaterial({map,roughness:1}));paint.rotation.y=angle;}
function books(x,y,z,count=10){for(let i=0;i<count;i++){const book=box(x+i*.062,y+.12,z,.047,.21+rnd()*.08,.17,[clay,blue,green,cream][i%4],.008);book.rotation.z=(rnd()-.5)*.06;}}
function lamp(x,z,y=.7){cyl(x,y+.03,z,.12,.035,brass);cyl(x,y+.22,z,.018,.36,brass);const shade=new T.Mesh(new T.CylinderGeometry(.13,.21,.28,40),white);shade.position.set(x,y+.44,z);scene.add(shade);}
function chair(x,z,angle,material=green){const before=scene.children.length;box(0,.48,0,.50,.12,.53,material,.07);box(0,.83,-.23,.50,.60,.10,material,.07);for(const xx of [-.19,.19])for(const zz of [-.2,.2])cyl(xx,.23,zz,.022,.46,walnut);const children=scene.children.slice(before),group=new T.Group();for(const child of children)group.add(child);group.position.set(x,0,z);group.rotation.y=angle;scene.add(group);}
function bed(cx,cz,accent){box(cx,.26,cz,1.92,.45,2.10,walnut,.08);box(cx,.53,cz,1.92,.22,2.12,white,.10);box(cx,.77,cz-1.03,2.04,1.33,.14,accent,.07);for(let i=0;i<9;i++)box(cx-.88+i*.22,.83,cz-1.12,.015,1.04,.01,cream);box(cx,.68,cz+.36,1.97,.11,1.36,accent,.07);for(let i=0;i<18;i++)box(cx-.95+i*.11,.742,cz+.47,.012,.008,1.00,cream);for(const dx of [-.47,.47]){const pillow=box(cx+dx,.72,cz-.68,.80,.18,.49,white,.10);pillow.rotation.y=dx*.12;}for(const dx of [-1.30,1.30]){box(cx+dx,.34,cz-.66,.52,.65,.48,oak,.035);box(cx+dx,.53,cz-.40,.20,.025,.015,brass);lamp(cx+dx,cz-.66,.67);}}
// 12 x 11 m synthetic layout: living/dining/kitchen in front, two separate
// bedrooms behind a full-height partition with open doorways, plus shower room.
const floorMat=paleOak.clone();floorMat.map=paleOak.map.clone();floorMat.map.repeat.set(6,5.5);box(6,-.06,5.5,12,.12,11,floorMat);
box(6,3.08,5.5,12,.10,11,white);box(6,1.5,0,12,3,.12,wall);box(0,1.5,5.5,.12,3,11,wall);box(12,1.5,5.5,.12,3,11,wall);
// Back exterior window wall.
box(6,.47,11,12,.94,.12,wall);box(6,2.84,11,12,.32,.12,wall);
for(const x of [0,2,4,6,8,10,12])box(x,1.88,11,.12,1.9,.15,white);
for(let x=1;x<12;x+=2){box(x,1.85,11.08,1.85,1.76,.03,new T.MeshStandardMaterial({color:'#a7c1c9',roughness:.5,emissive:'#a7c1c9',emissiveIntensity:.10}));for(let j=0;j<5;j++)box(x-.85+j*.09,1.85,10.88,.09,1.89,.12,cream,.035);}
// Bedroom partition, doors centred at x=3.5 and x=9.0; clear width 1.35 m.
for(const [left,right] of [[0,2.825],[4.175,8.325],[9.675,12]])box((left+right)/2,1.5,6.5,right-left,3,.14,wall);
for(const x of [3.5,9]){box(x,2.64,6.5,1.35,.72,.14,wall);for(const side of [-1,1])box(x+side*.695,1.15,6.49,.06,2.30,.20,oak);box(x,2.32,6.49,1.45,.07,.20,oak);}
box(6,1.5,8.75,.14,3,4.5,wall);
for(const z of [.09,10.90])box(6,.065,z,12,.13,.035,white);for(const x of [.09,11.90])box(x,.065,5.5,.035,.13,11,white);
box(8.0,1.1,.085,.95,2.2,.06,walnut);box(7.65,1.03,.15,.03,.13,.045,brass);
// Living room, with full furniture geometry and small stable surface details.
box(5.1,.018,4.50,3.65,.026,2.7,surface('#c3b193','rug'));box(5.3,.30,3.1,2.7,.42,.96,cream,.12);box(5.3,.78,2.71,2.7,.76,.20,cream,.09);
for(const x of [4.02,6.58])box(x,.65,3.08,.24,.50,.98,cream,.08);
for(const x of [4.45,5.3,6.15]){box(x,.56,3.13,.78,.19,.76,white,.07);const p=box(x,.86,2.94,.56,.47,.16,x<5?green:clay,.09);p.rotation.x=-.15;}
for(const x of [4.2,6.4])for(const z of [2.8,3.45])cyl(x,.12,z,.035,.24,walnut);
cyl(5.2,.43,4.60,.72,.09,oak);for(const a of [0,2.1,4.2])cyl(5.2+Math.sin(a)*.46,.21,4.6+Math.cos(a)*.46,.026,.40,metal);
for(let i=0;i<3;i++){const b=box(5.2,.495+i*.028,4.65,.38,.025,.26,[blue,clay,cream][i],.006);b.rotation.y=i*.13;}cyl(4.86,.51,4.40,.07,.13,white);cyl(5.48,.49,4.32,.13,.045,clay);
box(5.5,.30,6.12,3.0,.6,.55,walnut,.045);for(let i=0;i<12;i++)box(4.08+i*.255,.30,.665,.006,.5,.016,brass);box(5.45,1.50,6.40,2.00,1.14,.055,metal,.025);box(5.45,1.50,6.36,1.91,1.05,.009,new T.MeshStandardMaterial({color:'#263c43',roughness:.6}));books(4.13,.65,6.08,8);plant(7.35,.6,1.9);plant(7.8,5.8,1.8);
art(5.2,2.1,.10,1.45,.85);art(1.3,2.05,6.40,1.40,1.02,Math.PI);
// Dining room and kitchen.
box(2.3,.80,3.4,1.65,.10,1.15,oak,.045);for(const x of [1.60,3])for(const z of [2.94,3.86])cyl(x,.40,z,.045,.76,walnut);
chair(1.10,3.4,Math.PI/2);chair(3.5,3.4,-Math.PI/2);chair(2.3,2.40,0);chair(2.3,4.40,Math.PI);
for(const x of [1.80,2.75]){cyl(x,.861,3.4,.18,.018,white);cyl(x+.15,.927,3.08,.038,.13,brass);}cyl(2.3,1.01,3.45,.09,.31,clay);ellipsoid(2.3,1.28,3.45,.19,.20,.16,green);
for(let z=.45;z<2.5;z+=.6){box(.38,.45,z,.67,.90,.57,green,.018);box(.73,.72,z,.025,.025,.22,brass);box(.32,2.04,z,.55,.76,.57,white,.015);box(.61,1.93,z,.025,.16,.025,brass);}
box(.43,.94,1.4,.84,.065,2.65,white,.025);
for(let z=.15;z<2.70;z+=.20)for(let y=1.1;y<1.65;y+=.18)box(.08,y,z,.025,.17,.19,[cream,white,green][Math.floor(rnd()*3)]);
box(.42,.99,.68,.55,.02,.52,metal,.012);for(const z of [.54,.83])for(const x of [.29,.57])cyl(x,1.006,z,.083,.018,brass);
box(.43,.99,2.12,.49,.02,.40,metal,.04);cyl(.20,1.14,2.12,.018,.3,brass);box(.31,1.29,2.12,.22,.025,.025,brass,.01);
box(1.23,1.02,.38,.77,2.04,.68,new T.MeshStandardMaterial({color:'#9aaca7',metalness:.35,roughness:.5}),.045);box(1.48,1.36,.74,.025,.42,.035,metal,.01);
art(2.85,1.95,.095,1.13,.84);box(8.8,.78,3.6,1.6,.10,.62,paleOak,.025);books(8.25,.84,3.58,12);plant(9.9,5.45,1.5);
// Shower room off the entrance hall, with a clear doorway.
box(9,1.5,1.35,.12,3,2.7,wall);box(9.48,1.5,2.7,.85,3,.12,wall);box(11.54,1.5,2.7,.85,3,.12,wall);box(10.5,2.64,2.7,1.22,.72,.12,wall);
box(10.5,.015,1.35,2.88,.025,2.6,surface('#c3c7c2','rug'));box(9.44,.42,1.65,.72,.8,.76,paleOak,.02);box(9.44,.85,1.65,.76,.08,.78,white,.07);ellipsoid(9.44,.89,1.65,.26,.06,.27,white);cyl(9.14,1.00,1.65,.02,.29,brass);box(9.08,1.65,1.65,.025,.84,.64,new T.MeshStandardMaterial({color:'#a6bfbd',metalness:.6,roughness:.5}));
ellipsoid(11.30,.33,1.67,.27,.25,.38,white);box(11.30,.44,1.92,.46,.65,.19,white,.07);box(11.30,.60,1.60,.54,.06,.70,white,.14);box(10.73,.06,.72,1.6,.10,1.2,white,.06);cyl(11.72,1.25,.32,.025,2.25,brass);box(11.57,2.3,.32,.35,.025,.30,metal,.03);
// Two physically separate furnished bedrooms.
bed(2.25,8.2,green);bed(8.30,8.2,blue);
for(const [left,accent] of [[0,green],[6,blue]]){
 box(left+2.25,.018,8.45,3.5,.026,3.2,surface(left?'#b6b8b8':'#b8aa95','rug'));
 box(left+5.49,1.23,8.63,.81,2.46,2.52,paleOak,.025);for(const z of [7.85,8.64,9.43]){box(left+5.06,1.23,z,.025,2.36,.01,walnut);box(left+5.015,1.18,z+.12,.035,.36,.03,brass,.01);}
 box(left+.48,.74,9.88,.76,.075,1.20,oak,.025);chair(left+1.08,9.85,-Math.PI/2,accent);books(left+.22,.80,9.55,5);lamp(left+.4,10.23,.80);plant(left+4.9,10.4,1.45);
 art(left+1.25,2.16,6.60,1.35,.72);art(left+4.7,1.9,10.88,.75,.88,Math.PI);
}
// Soft neutral illumination, retained geometry shadows and non-clipped whites.
scene.add(new T.HemisphereLight('#f7f3e9','#696a65',1.5));const sun=new T.DirectionalLight('#fff5e6',2.2);sun.position.set(3,9,14);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-10,right:10,top:12,bottom:-12,near:.1,far:35});sun.shadow.bias=-.0002;sun.shadow.normalBias=.015;scene.add(sun);
for(const [x,z] of [[3,3],[8,3],[2.8,8.9],[8.8,8.9]]){const l=new T.PointLight('#fff2dc',13,10,2);l.position.set(x,2.74,z);scene.add(l);cyl(x,2.97,z,.22,.05,white);}
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1440);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;document.body.style.margin='0';document.body.append(renderer.domElement);
const camera=new T.PerspectiveCamera(72,4/3,.035,50),views=[];
function orbit(cx,cz,rx,rz,count,room){for(let i=0;i<count;i++){const a=i/count*Math.PI*2;views.push({p:[cx+rx*Math.sin(a),1.55+.15*Math.sin(2*a),cz+rz*Math.cos(a)],t:[cx,.95,cz],room});}}
orbit(4.1,3.6,3.05,2.15,36,'Living and kitchen');
// Shared doorway views connect every room to the hall, including views looking
// back through the door. Camera positions stay in open walking space.
function bridge(x,z0,z1,room){for(let i=0;i<12;i++){const u=i/11;views.push({p:[x+.12*Math.sin(i*.5),1.58,z0+(z1-z0)*u],t:[x+(x<6?-1:0),1.0,z1+1.3],room});}}
bridge(3.5,4.8,7.2,'Bedroom 1 doorway');orbit(2.9,8.8,2.00,1.65,24,'Bedroom 1');
for(let i=0;i<12;i++){const u=i/11;views.push({p:[3.5,1.6,7.3-2.0*u],t:[4.6,1.0,3.5],room:'Bedroom 1 return'});}
for(let i=0;i<12;i++){const u=i/11;views.push({p:[3.5+5.5*u,1.6,5.35],t:[5.1+2.9*u,1.0,3.8],room:'Hall'});}
bridge(9,5.1,7.2,'Bedroom 2 doorway');orbit(8.95,8.8,2.0,1.65,24,'Bedroom 2');
for(let i=0;i<12;i++){const u=i/11;views.push({p:[9,1.6,7.3-2.0*u],t:[7,1.0,3.8],room:'Bedroom 2 return'});}
for(let i=0;i<12;i++){const a=i/11*Math.PI*.8;views.push({p:[10.5+.24*Math.sin(a),1.6,3.7-i/11*1.8],t:[10.5+.4*Math.sin(a),.95,1.3],room:'Bathroom'});}
// Additional continuous hall-to-bathroom bridge. Start with the same living
// features seen on the bedroom return, then turn gradually into the doorway.
for(const [x,z,tx,tz] of [[9,5.2,7,3.8],[9.2,4.95,7.5,3.4],[9.5,4.65,8.5,3.1],[9.8,4.3,9.4,2.4],[10.1,4.0,10.1,1.4],[10.4,3.65,10.5,1.3],[10.5,3.35,10.5,1.3],[10.5,3.05,10.5,1.3],[10.5,2.75,10.5,1.3],[10.5,2.45,10.7,1.3],[10.5,2.2,10.85,1.3],[10.5,1.95,10.9,1.3]])views.push({p:[x,1.6,z],t:[tx,1.0,tz],room:'Bathroom connecting path'});
// Wide-lens return path and interior turn: capture BOTH sides of the doorway.
for(const [x,z,tx,tz] of [[10.5,2.15,9.8,5.2],[10.5,2.35,9.6,5.2],[10.5,2.55,9.4,5.2],[10.5,2.8,9.2,5.2],[10.5,3.05,9,5.2],[10.4,3.3,8.7,5],[10.25,3.55,8.3,4.8],[10,3.85,7.8,4.6],[9.7,4.15,7.2,4.3],[9.3,4.45,6.5,4],[8.8,4.6,5.8,3.7],[8.3,4.6,5.2,3.6]])views.push({p:[x,1.6,z],t:[tx,1.0,tz],room:'Bathroom return to hall',fov:90});
for(let i=0;i<12;i++){const a=i/12*Math.PI*2;views.push({p:[10.5+.35*Math.sin(a),1.6,2.15+.25*Math.cos(a)],t:[10.5+2*Math.sin(a),1.0,2.15+2*Math.cos(a)],room:'Bathroom interior turn',fov:90});}
// Oblique doorway overlap: each image includes bathroom and hall surfaces,
// with lateral translation so shared details have useful triangulation parallax.
for(let i=0;i<12;i++){const u=i/11;views.push({p:[10.25+.35*Math.sin(u*Math.PI),1.50+.12*Math.sin(u*Math.PI),2.30+.65*u],t:[9.15,1.0,2.65+.25*u],room:'Bathroom sideways doorway overlap',fov:90});}
window.captureManifest={width:1920,height:1440,count:views.length,rooms:views.map(v=>v.room)};
window.renderCapture=index=>{const v=views[index];camera.fov=v.fov??72;camera.updateProjectionMatrix();camera.position.set(...v.p);camera.lookAt(...v.t);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');};window.ready=true;
