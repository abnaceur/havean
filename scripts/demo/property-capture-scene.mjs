// Original synthetic studio apartment. This renderer supplies pixels only to
// reconstruction; its geometry, camera matrices and dimensions are never inputs.
import * as T from 'three';
let seed=112203;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
function texture(base,kind){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,512,512);for(let i=0;i<12000;i++){const x=random()*512,y=random()*512;g.fillStyle=`rgba(${random()>.5?'255,255,255':'35,25,15'},${random()*.15})`;g.fillRect(x,y,kind==='wood'?random()*60+2:2,kind==='wood'?1:2);}if(kind==='wood'){for(let y=0;y<512;y+=64){g.fillStyle='rgba(35,25,15,.2)';g.fillRect(0,y,512,2);for(let x=(y%128)*2;x<512;x+=256)g.fillRect(x,y,2,64);}}if(kind==='rug'){for(let y=0;y<512;y+=32)for(let x=0;x<512;x+=32){g.strokeStyle=['#856d52','#d7c8a0','#646c65'][Math.floor(random()*3)];g.lineWidth=3;g.strokeRect(x+5,y+5,22,22);}}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
const mat=(color,kind)=>new T.MeshStandardMaterial({color:kind?'#ffffff':color,roughness:.82,map:kind?texture(color,kind):null});
const wood=mat('#ae8454','wood'),oak=mat('#d3ba8d','wood'),fabric=mat('#b8b39c','fabric'),green=mat('#778b79','fabric'),white=mat('#eee8dd','fabric'),dark=mat('#343b3a'),metal=mat('#727b77'),wall=mat('#e4ded0','fabric');
const scene=new T.Scene();scene.background=new T.Color('#e2e9ed');
function box(x,y,z,w,h,d,m=wood){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;scene.add(o);return o;}
function cylinder(x,y,z,r,h,m){const o=new T.Mesh(new T.CylinderGeometry(r,r,h,24),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;scene.add(o);return o;}
function sphere(x,y,z,sx,sy,sz,m){const o=new T.Mesh(new T.SphereGeometry(1,16,10),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;scene.add(o);return o;}
function plant(x,z,h=1.5){cylinder(x,.2,z,.19,.4,mat('#b48160'));cylinder(x,h*.47,z,.035,h*.8,wood);for(let i=0;i<16;i++){const a=i*2.4,r=.12+random()*.27;const leaf=sphere(x+Math.sin(a)*r,h*.5+random()*h*.5,z+Math.cos(a)*r,.13,.25,.06,mat(['#477044','#738657','#496755'][i%3]));leaf.rotation.set(random(),a,random());}}
// Continuous studio shell, textured floor, large windows and entry door.
const floor=box(4,-.07,3.25,8,.12,6.5,oak);floor.material.map.repeat.set(4,3);
box(4,1.5,0,8,3,.12,wall);box(0,1.5,3.25,.12,3,6.5,wall);box(8,1.5,3.25,.12,3,6.5,wall);
box(4,.45,6.5,8,.9,.12,wall);box(4,2.82,6.5,8,.36,.12,wall);for(const x of [0,2.65,5.35,8])box(x,1.83,6.5,.12,1.9,.15,white);
for(const x of [1.3,4,6.7]){box(x,1.8,6.56,2.5,1.75,.025,new T.MeshStandardMaterial({color:'#bfd3d9',roughness:.3,emissive:'#7e939a',emissiveIntensity:.2}));for(let i=0;i<4;i++)box(x-1.15+i*.12,1.8,6.36,.11,1.85,.10,fabric);}
box(4,3.04,3.25,8,.08,6.5,white);for(const z of [.09,6.39])box(4,.07,z,8,.14,.04,white);for(const x of [.09,7.91])box(x,.07,3.25,.04,.14,6.5,white);
box(7.1,1.08,.09,.88,2.16,.06,wood);box(6.79,1.02,.15,.04,.12,.06,metal);
// Kitchen along left wall: cupboards, tiled splashback, hob, sink and shelves.
for(let z=.75;z<3;z+=.6){box(.38,.45,z,.64,.9,.58,green);box(.72,.66,z,.04,.025,.21,metal);box(.35,2.02,z,.56,.7,.58,white);box(.65,1.8,z,.03,.16,.02,metal);}
box(.41,.94,1.65,.83,.08,2.45,mat('#d6d1c4','rug'));
for(let z=.5;z<2.9;z+=.22)for(let y=1.08;y<1.65;y+=.20)box(.095,y,z,.03,.185,.205,mat(['#ddd7c9','#b8c1b5','#d2c9b4'][Math.floor(random()*3)]));
box(.46,.995,.84,.56,.025,.53,dark);for(const z of [.7,.99])for(const x of [.32,.60])cylinder(x,1.017,z,.085,.02,metal);
box(.45,1,2.38,.48,.025,.38,metal);cylinder(.22,1.12,2.38,.025,.24,metal);box(.32,1.235,2.38,.22,.03,.03,metal);
box(.39,1.02,3.6,.72,2.04,.68,metal);box(.765,1.37,3.63,.04,.45,.03,dark);box(.78,.72,3.6,.012,.025,.64,dark);
// Dining table and upholstered chairs.
box(2.25,.78,2.55,1.45,.09,1.1,wood);for(const x of [1.64,2.86])for(const z of [2.12,2.98])box(x,.39,z,.08,.74,.08,dark);
for(const [x,z,a] of [[1.12,2.55,Math.PI/2],[3.38,2.55,-Math.PI/2],[2.25,1.6,0],[2.25,3.5,Math.PI]]){const group=new T.Group();const seat=new T.Mesh(new T.BoxGeometry(.52,.12,.53),green);seat.position.y=.47;group.add(seat);const back=new T.Mesh(new T.BoxGeometry(.52,.52,.09),green);back.position.set(0,.78,-.24);group.add(back);for(const xx of [-.2,.2])for(const zz of [-.2,.2]){const leg=new T.Mesh(new T.CylinderGeometry(.025,.02,.45,8),wood);leg.position.set(xx,.23,zz);group.add(leg);}group.position.set(x,0,z);group.rotation.y=a;scene.add(group);}
for(let i=0;i<3;i++){cylinder(1.8+i*.43,.842,2.5,.15,.02,white);cylinder(1.85+i*.43,.90,2.25,.035,.13,metal);}cylinder(2.25,1.04,2.8,.09,.38,mat('#ba7752'));sphere(2.25,1.3,2.8,.22,.19,.2,green);
// Living area with sofa, cushions, rug, table, books and plants.
box(5.1,.016,4.4,3.2,.025,2.55,mat('#b2a58b','rug'));box(5.35,.35,3.25,2.55,.45,.93,fabric);box(5.35,.82,2.86,2.55,.65,.19,fabric);for(const x of [4.13,6.57])box(x,.66,3.24,.22,.45,.92,fabric);
for(const x of [4.55,5.35,6.15]){box(x,.61,3.28,.73,.15,.72,white);const p=box(x,.88,3.10,.52,.44,.15,x<5?green:mat('#b48b67','fabric'));p.rotation.x=-.15;}
cylinder(5.15,.40,4.6,.64,.10,wood);for(const a of [0,2.1,4.2])box(5.15+Math.sin(a)*.42,.20,4.6+Math.cos(a)*.42,.045,.38,.045,dark);
for(let i=0;i<4;i++){const b=box(5.18,.47+i*.025,4.65,.38,.025,.26,mat(['#b9784d','#d6c8a8','#68816e','#ccc5b4'][i]));b.rotation.y=i*.12;}cylinder(4.87,.50,4.35,.07,.12,white);
plant(7.45,5.8,1.9);plant(3.1,.6,1.3);box(7.45,.38,4.05,.62,.75,1.6,oak);for(let i=0;i<18;i++)box(7.10,.56,3.35+i*.076,.12,.25+random()*.13,.06,mat(['#ad694b','#bdac88','#657e7c','#d5cdb8'][i%4]));
// Sleeping alcove with upholstered bed, blanket, pillows and bedside lighting.
box(5.3,.24,1.15,2.0,.44,1.95,wood);box(5.3,.51,1.15,1.92,.18,1.9,white);box(5.3,.70,.14,2.06,1.12,.12,green);box(5.3,.63,1.58,1.94,.09,1.05,mat('#a37b65','fabric'));for(const x of [4.85,5.75]){const p=box(x,.66,.57,.75,.16,.44,white);p.rotation.y=(x-5.3)*.1;}
box(6.67,.33,.7,.5,.66,.5,oak);cylinder(6.67,.75,.7,.07,.18,dark);const lamp=new T.Mesh(new T.ConeGeometry(.2,.28,24),white);lamp.position.set(6.67,.98,.7);scene.add(lamp);
// Rich, original wall art supplies plausible stable visual detail.
for(const [x,z,w] of [[1.6,.10,1.15],[3.2,.10,.75],[5.2,.10,1.2]]){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#e2d7bd';g.fillRect(0,0,256,256);for(let i=0;i<55;i++){g.fillStyle=['#456a68','#ab6f47','#747f57','#d6b271','#574d45'][i%5];g.beginPath();g.ellipse(random()*256,random()*256,5+random()*55,5+random()*60,random()*3,0,7);g.fill();}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;box(x,2.15,z,w+.08,.85,.05,wood);box(x,2.15,z+.03,w,.77,.01,new T.MeshStandardMaterial({map:t,roughness:1}));}
scene.add(new T.HemisphereLight('#fff0db','#8b887d',2.2));const sun=new T.DirectionalLight('#fff1d4',3.0);sun.position.set(4,7,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.bias=-.0003;scene.add(sun);for(const p of [[2,2.6,2],[5.5,2.6,4.5]]){const l=new T.PointLight('#ffe6bc',18,8,2);l.position.set(...p);scene.add(l);}
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,480);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.style.margin='0';document.body.append(renderer.domElement);
const camera=new T.PerspectiveCamera(82,640/480,.04,35);
window.renderCapture=index=>{const a=index/48*Math.PI*2;camera.position.set(4+2.7*Math.sin(a),1.65+.12*Math.sin(a*2),3.25+2.2*Math.cos(a));camera.lookAt(4,1.0,3.1);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');};window.ready=true;
