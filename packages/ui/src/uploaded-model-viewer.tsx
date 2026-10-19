'use client';
import {useEffect,useRef,useState} from 'react';
import {RotateCcw,ZoomIn,ZoomOut,Download} from 'lucide-react';
import type {Mesh,Texture} from 'three';

export function UploadedModelViewer({url,title,autoOpen=false,immersive=false}:{url:string;title:string;autoOpen?:boolean;immersive?:boolean}){
 const host=useRef<HTMLDivElement>(null),reset=useRef(()=>{}),zoom=useRef((_factor:number)=>{});
 const [open,setOpen]=useState(autoOpen),[attempt,setAttempt]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{
  if(!open||!host.current)return;const mount=host.current,abort=new AbortController();let stopped=false,dispose=()=>{};setLoading(true);setError('');
  const timeout=setTimeout(()=>abort.abort(),30000);
  async function load(){
   const response=await fetch(url,{credentials:'same-origin',signal:abort.signal});if(!response.ok||!response.headers.get('content-type')?.includes('model/gltf-binary'))throw Error('This 3D plan is unavailable.');
   const bytes=await response.arrayBuffer();if(bytes.byteLength>32*1024*1024)throw Error('The 3D plan exceeds the preview limit.');
   const [THREE,{GLTFLoader},{OrbitControls}]=await Promise.all([import('three'),import('three/addons/loaders/GLTFLoader.js'),import('three/addons/controls/OrbitControls.js')]);if(stopped)return;
   const manager=new THREE.LoadingManager();manager.setURLModifier(value=>{if(!value.startsWith('blob:'))throw Error('External model resources are not supported.');return value;});
   const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');
   function releaseModel(){gltf.scene.traverse(object=>{const mesh=object as Mesh;if(!mesh.isMesh)return;mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){for(const value of Object.values(material))if(value&&typeof value==='object'&&(value as Texture).isTexture)(value as Texture).dispose();material.dispose();}});}
   if(stopped){releaseModel();return;}
   dispose=releaseModel;
   const scene=new THREE.Scene();scene.background=new THREE.Color(immersive?'#141c22':'#f2f5f3');scene.add(gltf.scene);scene.add(new THREE.HemisphereLight(0xffffff,0x657568,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(5,10,7);scene.add(light);
   const bounds=new THREE.Box3().setFromObject(gltf.scene),center=bounds.getCenter(new THREE.Vector3()),extent=Math.max(...bounds.getSize(new THREE.Vector3()).toArray(),.1);if(!Number.isFinite(extent)||bounds.isEmpty())throw Error('The 3D plan has no visible geometry.');
   const renderer=new THREE.WebGLRenderer({antialias:true});renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.domElement.setAttribute('aria-label','Uploaded 3D plan canvas');renderer.domElement.tabIndex=0;renderer.domElement.style.touchAction='none';mount.append(renderer.domElement);
   const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');if(stopped){renderer.dispose();releaseModel();return;}const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer),environment=generator.fromScene(room,.04);scene.environment=environment.texture;room.dispose();generator.dispose();
   const camera=new THREE.PerspectiveCamera(45,1,extent/1000,extent*100),controls=new OrbitControls(camera,renderer.domElement);controls.listenToKeyEvents(renderer.domElement);controls.minDistance=extent*.15;controls.maxDistance=extent*12;
   const draw=()=>renderer.render(scene,camera);zoom.current=factor=>{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();draw();};reset.current=()=>{camera.position.copy(center).add(new THREE.Vector3(extent,extent*.8,extent));controls.target.copy(center);controls.update();draw();};reset.current();controls.addEventListener('change',draw);
   const resize=()=>{const width=Math.max(1,mount.clientWidth),height=Math.max(1,mount.clientHeight);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();draw();};const observer=new ResizeObserver(resize);observer.observe(mount);resize();
   dispose=()=>{observer.disconnect();controls.dispose();releaseModel();environment.dispose();renderer.dispose();renderer.domElement.remove();reset.current=()=>{};zoom.current=()=>{};};
  }
  void load().catch(e=>{dispose();if(!stopped)setError(e instanceof Error?e.message:'Unable to preview this 3D plan.');}).finally(()=>{clearTimeout(timeout);if(!stopped)setLoading(false);});
  return()=>{stopped=true;clearTimeout(timeout);abort.abort();dispose();};
 },[open,url,immersive,attempt]);
 return <section className={immersive?'uploaded-model immersive-model':'uploaded-model'} aria-label={title+' 3D plan'}>{!immersive&&<button type="button" className="button secondary" onClick={()=>setOpen(value=>!value)}>{open?'Close 3D preview':'Preview 3D plan'}</button>}{open&&<><div ref={host} className="uploaded-model-canvas" style={immersive?{height:'100%',width:'100%'}:{height:360,width:'100%'}}/>{loading&&<p className="model-feedback" role="status">Loading 3D plan…</p>}{error&&<div className="model-feedback" role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry 3D plan</button></div>}<div className="uploaded-model-tools" role="group" aria-label="3D viewing controls"><button type="button" aria-label="Zoom out 3D view" disabled={loading||!!error} onClick={()=>zoom.current(1.2)}><ZoomOut size={19}/></button><button type="button" aria-label="Zoom in 3D view" disabled={loading||!!error} onClick={()=>zoom.current(.8)}><ZoomIn size={19}/></button><button type="button" className="button secondary" disabled={loading||!!error} onClick={()=>reset.current()}><RotateCcw size={18}/>Reset 3D view</button><a href={url} download="property-plan.glb" aria-label="Download 3D plan"><Download size={19}/></a></div><p className="model-gesture-hint">Drag to orbit · Scroll or pinch to zoom</p></>}{!open&&<a href={url} download="property-plan.glb">Download 3D plan</a>}</section>;
}
