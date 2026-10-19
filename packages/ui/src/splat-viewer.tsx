'use client';
import {useEffect,useRef,useState} from 'react';
import {inspectSplat,SPLAT_PREVIEW_LIMIT} from '@haven/contracts';
import {sceneFrameSample,type ScenePerformanceReport} from './splat-performance';
const vertexShader=`
attribute vec3 centre;
attribute vec3 covarianceA;
attribute vec3 covarianceB;
attribute vec4 colour;
uniform vec2 viewport;
varying vec2 gaussian;
varying vec4 tint;
void main(){
 vec4 camera=modelViewMatrix*vec4(centre,1.0);
 vec4 clip=projectionMatrix*camera;
 float depth=-camera.z;
 tint=colour; gaussian=position.xy*3.0;
 if(depth<=0.001 || clip.w<=0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);tint.a=0.0;return;}
 float fx=projectionMatrix[0][0]*viewport.x*0.5;
 float fy=projectionMatrix[1][1]*viewport.y*0.5;
 // Match the training rasterizer's bounded perspective Jacobian. Near-camera
 // splats outside the frustum otherwise expand across an entire interior view.
 vec2 limit=1.3*viewport/(2.0*vec2(fx,fy));
 vec2 projected=depth*clamp(camera.xy/depth,-limit,limit);
 vec3 jx=vec3(fx/depth,0.0,fx*projected.x/(depth*depth));
 vec3 jy=vec3(0.0,fy/depth,fy*projected.y/(depth*depth));
 mat3 rotation=mat3(modelViewMatrix);
 jx=vec3(dot(jx,rotation[0]),dot(jx,rotation[1]),dot(jx,rotation[2]));
 jy=vec3(dot(jy,rotation[0]),dot(jy,rotation[1]),dot(jy,rotation[2]));
 mat3 covariance=mat3(covarianceA.x,covarianceA.y,covarianceA.z,covarianceA.y,covarianceB.x,covarianceB.y,covarianceA.z,covarianceB.y,covarianceB.z);
 float a=dot(jx,covariance*jx)+0.3;
 float b=dot(jx,covariance*jy);
 float c=dot(jy,covariance*jy)+0.3;
 float middle=0.5*(a+c);
 float difference=sqrt(max(0.0,0.25*(a-c)*(a-c)+b*b));
 float major=max(middle+difference,0.3),minor=max(middle-difference,0.3);
 vec2 direction=abs(b)>0.0001?normalize(vec2(b,major-a)):(a>=c?vec2(1.0,0.0):vec2(0.0,1.0));
 vec2 offset=3.0*(position.x*sqrt(major)*direction+position.y*sqrt(minor)*vec2(-direction.y,direction.x));
 float cap=max(viewport.x,viewport.y)*2.0;
 offset=clamp(offset,vec2(-cap),vec2(cap));
 gl_Position=clip+vec4(2.0*offset/viewport*clip.w,0.0,0.0);
}`;
const fragmentShader=`
varying vec2 gaussian;
varying vec4 tint;
void main(){float radius=dot(gaussian,gaussian);if(radius>9.0)discard;float alpha=min(0.99,tint.a*exp(-0.5*radius));if(alpha<0.0039)discard;gl_FragColor=vec4(tint.rgb,alpha);}
`;
/** Lazy bounded orbit preview. A scene remains unscaled; no unapproved floor
 * transform, room traversal or XR support is inferred from this renderer. */
export function SplatViewer({url,onScopeLost,viewpoints=[],resolveViewpoint,publication=false,autoOpen=false,initialView}:{url:string;onScopeLost:()=>void;viewpoints?:Array<{id:string;label:string}>;resolveViewpoint?:(id:string)=>Promise<{scene:[number,number,number];up:[number,number,number]}>;publication?:boolean;autoOpen?:boolean;initialView?:{position:[number,number,number];forward:[number,number,number];up:[number,number,number];verticalFov:number;aspectRatio:number;basis:'recovered_capture_unverified'}|null}){
 const toggle=useRef<HTMLButtonElement>(null),mount=useRef<HTMLDivElement>(null),reset=useRef<()=>void>(()=>{}),measure=useRef<()=>void>(()=>{}),callback=useRef(onScopeLost);callback.current=onScopeLost;
 const move=useRef<(scene:[number,number,number],up:[number,number,number])=>void>(()=>{}),navigationGeneration=useRef(0);const [moving,setMoving]=useState(false);
 const [open,setOpen]=useState(autoOpen),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [ready,setReady]=useState(false),[sampling,setSampling]=useState(false),[report,setReport]=useState<ScenePerformanceReport|null>(null);
 useEffect(()=>{
  navigationGeneration.current++;setMoving(false);move.current=()=>{};if(!open||!mount.current)return;const host=mount.current,abort=new AbortController();let stopped=false,dispose=()=>{};setError('');setReady(false);setSampling(false);setReport(null);setStatus(publication?'Downloading reviewed scene…':'Downloading private scene…');const started=performance.now(),timer=setTimeout(()=>abort.abort(),30000);
  async function load(){
   if(!url.startsWith('/api/v1/'))throw Error('A scoped scene content URL is required.');
   const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:abort.signal});
   if(!response.ok){if([401,403,404].includes(response.status))callback.current();throw Error('The scene is unavailable.');}
   if(!response.headers.get('content-type')?.includes('application/octet-stream'))throw Error('Unsupported scene encoding.');
   const reader=response.body?.getReader();if(!reader)throw Error('Scene download unavailable.');const chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>SPLAT_PREVIEW_LIMIT*32){await reader.cancel();throw Error('Choose a smaller scene tier.');}chunks.push(next.value);if(!stopped)setStatus(`Downloaded ${size} bytes…`);}}finally{reader.releaseLock();}
   const downloadMilliseconds=performance.now()-started;
   const bytes=new Uint8Array(size);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}const data=inspectSplat(bytes.buffer);
   const [THREE,{OrbitControls}]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js')]);if(stopped)return;
   let renderer:InstanceType<typeof THREE.WebGLRenderer>;try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:false});}catch{throw Error('3D graphics unavailable. The property gallery remains available.');}
   const releases:Array<()=>void>=[];dispose=()=>{move.current=()=>{};reset.current=()=>{};measure.current=()=>{};for(const release of releases.splice(0).reverse())release();};releases.push(()=>{renderer.dispose();renderer.forceContextLoss();});
   renderer.debug.onShaderError=()=>{throw Error('Scene rendering is unavailable in this browser.');};
   renderer.setPixelRatio(Math.min(devicePixelRatio,2));const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',publication?'Reviewed reconstructed scene':'Private reconstructed scene');canvas.style.touchAction='none';canvas.style.margin='0 auto';canvas.style.display='block';host.append(canvas);
   releases.push(()=>canvas.remove());
   const scene=new THREE.Scene();scene.background=new THREE.Color('#edf0ef');const camera=new THREE.PerspectiveCamera(45,1,.01,10000),controls=new OrbitControls(camera,canvas);
   releases.push(()=>controls.dispose());
   const geometry=new THREE.InstancedBufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));geometry.setIndex([0,1,2,0,2,3]);geometry.instanceCount=data.count;
   releases.push(()=>geometry.dispose());
   const attributes={centre:new THREE.InstancedBufferAttribute(new Float32Array(data.count*3),3),covarianceA:new THREE.InstancedBufferAttribute(new Float32Array(data.count*3),3),covarianceB:new THREE.InstancedBufferAttribute(new Float32Array(data.count*3),3),colour:new THREE.InstancedBufferAttribute(new Float32Array(data.count*4),4)};
   for(const [name,attribute] of Object.entries(attributes))geometry.setAttribute(name,attribute);
   const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{viewport:{value:new THREE.Vector2(1,1)}},transparent:true,depthWrite:false});const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
   releases.push(()=>{scene.remove(mesh);material.dispose();});
   // Frame the central visible content. Sparse distant points and near-transparent
   // giant splats must not shrink the initial scene to a dot. Every splat remains
   // rendered, and zoom/far limits still include the complete validated bounds.
   const visible=Array.from({length:data.count},(_,index)=>index).filter(index=>data.colours[index*4+3]>=.1);
   const fullExtent=Math.max(new THREE.Vector3(...data.bounds.max).sub(new THREE.Vector3(...data.bounds.min)).length(),.001);
   const frameMin=[...data.bounds.min],frameMax=[...data.bounds.max];
   if(visible.length>=16){
    const radii=visible.map(index=>3*Math.sqrt(Math.max(data.covariances[index*6],data.covariances[index*6+3],data.covariances[index*6+5]))).sort((a,b)=>a-b),padding=radii[Math.floor(radii.length*.5)];
    for(let axis=0;axis<3;axis++){const values=visible.map(index=>data.positions[index*3+axis]).sort((a,b)=>a-b);frameMin[axis]=values[Math.floor((values.length-1)*.025)]-padding;frameMax[axis]=values[Math.ceil((values.length-1)*.975)]+padding;}
   }
   const center=new THREE.Vector3(...frameMin).add(new THREE.Vector3(...frameMax)).multiplyScalar(.5),extent=Math.max(new THREE.Vector3(...frameMax).sub(new THREE.Vector3(...frameMin)).length(),.001);
   // Negative Z with Y down is an inspection angle for the unregistered scene
   // export, not an approved floor transform or recovered navigation pose.
   camera.up.set(0,-1,0);camera.position.copy(center).add(new THREE.Vector3(0,0,-extent*.7));camera.near=Math.max(extent/10000,.0001);camera.far=fullExtent*20;camera.updateProjectionMatrix();controls.target.copy(center);controls.enablePan=false;controls.minDistance=extent*.05;controls.maxDistance=fullExtent*3;controls.enableDamping=false;if(initialView&&!publication){camera.up.set(...initialView.up).normalize();camera.position.set(...initialView.position);camera.fov=initialView.verticalFov;camera.updateProjectionMatrix();controls.target.copy(camera.position).add(new THREE.Vector3(...initialView.forward).normalize().multiplyScalar(extent*.2));}controls.update();controls.saveState();
   const order=Array.from({length:data.count},(_,index)=>index),depths=new Float32Array(data.count);
   function draw(){
    if(stopped)return;camera.updateMatrixWorld();const matrix=camera.matrixWorldInverse.elements;
    for(let i=0;i<data.count;i++)depths[i]=matrix[2]*data.positions[i*3]+matrix[6]*data.positions[i*3+1]+matrix[10]*data.positions[i*3+2]+matrix[14];
    order.sort((a,b)=>depths[a]-depths[b]);
    for(let index=0;index<order.length;index++){const source=order[index];attributes.centre.array.set(data.positions.subarray(source*3,source*3+3),index*3);attributes.colour.array.set(data.colours.subarray(source*4,source*4+4),index*4);attributes.covarianceA.array.set(data.covariances.subarray(source*6,source*6+3),index*3);attributes.covarianceB.array.set(data.covariances.subarray(source*6+3,source*6+6),index*3);}
    for(const attribute of Object.values(attributes))attribute.needsUpdate=true;renderer.render(scene,camera);
   }
   const resize=()=>{if(stopped)return;const available=Math.max(host.clientWidth,1),aspect=initialView&&!publication?initialView.aspectRatio:null,height=aspect?Math.min(480,available/aspect):360,width=aspect?height*aspect:available;host.style.height=height+'px';renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.getDrawingBufferSize(material.uniforms.viewport.value);draw();};
   const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',draw);reset.current=()=>{if(initialView&&!publication)camera.up.set(...initialView.up).normalize();else camera.up.set(0,-1,0);controls.reset();draw();};move.current=(position,up)=>{if(stopped||renderer.getContext().isContextLost())throw Error('Scene graphics unavailable. Reopen the preview.');camera.up.set(...up).normalize();camera.position.set(...position);const direction=center.clone().sub(camera.position);if(direction.length()<extent*.001||Math.abs(direction.clone().normalize().dot(camera.up))>.99){direction.set(1,0,0);if(Math.abs(direction.dot(camera.up))>.99)direction.set(0,1,0);direction.addScaledVector(camera.up,-direction.dot(camera.up));}direction.normalize().multiplyScalar(extent*.1);controls.target.copy(camera.position).add(direction);controls.update();draw();};
   releases.push(()=>{observer.disconnect();controls.removeEventListener('change',draw);});
   const keyboard=(event:KeyboardEvent)=>{if(!['+','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();if(event.key==='Home')reset.current();else if(event.key.startsWith('Arrow')){const align=new THREE.Quaternion().setFromUnitVectors(camera.up,new THREE.Vector3(0,1,0)),orbit=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target).applyQuaternion(align));if(event.key==='ArrowLeft')orbit.theta-=.08;if(event.key==='ArrowRight')orbit.theta+=.08;if(event.key==='ArrowUp')orbit.phi-=.08;if(event.key==='ArrowDown')orbit.phi+=.08;orbit.phi=Math.min(Math.PI-.01,Math.max(.01,orbit.phi));camera.position.setFromSpherical(orbit).applyQuaternion(align.invert()).add(controls.target);controls.update();draw();}else{const distance=camera.position.distanceTo(controls.target),next=Math.min(controls.maxDistance,Math.max(controls.minDistance,distance*(event.key==='+'?.9:1.1)));camera.position.sub(controls.target).multiplyScalar(next/distance).add(controls.target);controls.update();draw();}};
   const lost=(event:Event)=>{event.preventDefault();if(!stopped){setReady(false);setReport(null);setError('Scene graphics interrupted. Close and reopen the preview.');}};canvas.addEventListener('keydown',keyboard);canvas.addEventListener('webglcontextlost',lost);
   releases.push(()=>{canvas.removeEventListener('keydown',keyboard);canvas.removeEventListener('webglcontextlost',lost);});
   resize();const firstRenderMilliseconds=performance.now()-started;let sampleFrame=0,sampleDeadline:ReturnType<typeof setTimeout>|undefined;
   const cancelSample=()=>{cancelAnimationFrame(sampleFrame);clearTimeout(sampleDeadline);sampleFrame=0;};releases.push(cancelSample);
   measure.current=()=>{
    cancelSample();setReport(null);if(document.visibilityState!=='visible'){setError('Keep the scene visible while measuring.');return;}setError('');setSampling(true);
    const timestamps:number[]=[];
    const interrupted=()=>{cancelSample();if(!stopped){setSampling(false);setError('Scene measurement interrupted. Keep this tab visible and try again.');}};
    sampleDeadline=setTimeout(interrupted,7000);
    const sample=(timestamp:number)=>{
     if(stopped)return;if(document.visibilityState!=='visible'||renderer.getContext().isContextLost()){interrupted();return;}
     try{draw();timestamps.push(timestamp);if(timestamps.length<121&&timestamp-timestamps[0]<3000){sampleFrame=requestAnimationFrame(sample);return;}
      cancelSample();const sampleResult=sceneFrameSample(timestamps);
      const sceneTypedArrayBytes=data.positions.byteLength+data.covariances.byteLength+data.colours.byteLength+depths.byteLength+Object.values(geometry.attributes).reduce((total,attribute)=>total+attribute.array.byteLength,0)+(geometry.getIndex()?.array.byteLength??0);
      setReport({schemaVersion:1,measuredAt:new Date().toISOString(),browser:navigator.userAgent,viewport:{width:canvas.width,height:canvas.height,pixelRatio:renderer.getPixelRatio()},splatCount:data.count,downloadBytes:size,downloadMilliseconds,firstRenderMilliseconds,sample:sampleResult,memory:{sceneTypedArrayBytes,rendererGeometries:renderer.info.memory.geometries,rendererTextures:renderer.info.memory.textures,gpuBytes:null},limitations:['Stationary view in this browser; RAF cadence includes CPU sorting and render submission, not GPU completion timing.','Typed-array storage excludes JS objects, download buffers, driver allocations and GPU memory.','This scene sample does not establish real-device, reconstruction, motion or headset acceptance.']});setSampling(false);
     }catch{interrupted();}
    };sampleFrame=requestAnimationFrame(sample);
   };
   if(!stopped){setReady(true);setStatus(`Scene loaded: ${data.count} splats · ${data.byteSize} bytes. Scale and room coverage are unverified.`);}
  }
  void load().catch(reason=>{dispose();if(!stopped){setReady(false);setError(reason instanceof Error?reason.message:'Scene preview failed.');}}).finally(()=>clearTimeout(timer));
  return()=>{stopped=true;abort.abort();clearTimeout(timer);dispose();};
 },[open,url,publication,initialView]);
 async function navigate(id:string){if(!resolveViewpoint||!ready)return;const generation=navigationGeneration.current;setMoving(true);setError('');try{const position=await resolveViewpoint(id);if(generation!==navigationGeneration.current)return;move.current(position.scene,position.up);setReport(null);setStatus('Approved private viewpoint selected. Viewing direction is an orbit control, not a recovered camera pose.');}catch(e){if(generation===navigationGeneration.current)setError(e instanceof Error?e.message:'Private viewpoint approval unavailable.');}finally{if(generation===navigationGeneration.current)setMoving(false);}}
 return <section aria-label={publication?'Reviewed reconstructed scene preview':'Private reconstructed scene preview'} onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();setOpen(false);toggle.current?.focus();}}}><p>{publication?'Reviewed reconstruction is an unscaled visual approximation. Metric measurements, complete room coverage and floor navigation are unavailable.':'Reconstruction is a visual approximation. Metric measurements, room coverage and floor navigation require independent review. This preview has no verified headset support.'}</p>{initialView&&!publication&&<p>Initial view recovered from the capture. Position and scale remain unverified.</p>}<p className="fine-print">VR headset support is paused. Explore this scene using the on-screen controls.</p><button ref={toggle} type="button" onClick={()=>setOpen(v=>!v)}>{open?'Close scene preview':'Open scene preview'}</button>{open&&<><button type="button" onClick={()=>reset.current()}>Reset scene view</button><p role="status">{status}</p>{viewpoints.length>0&&<nav aria-label="Approved private camera viewpoints">{viewpoints.map(viewpoint=><button key={viewpoint.id} disabled={!ready||moving} onClick={()=>void navigate(viewpoint.id)}>View {viewpoint.label}</button>)}</nav>}{error&&<p role="alert">{error}</p>}<p>Drag or use arrow keys to orbit. Scroll or use +/− to zoom; Home resets the view. Escape closes the preview.</p><div className="scene-viewer-canvas" ref={mount} style={{width:'100%',height:360}}/>{!publication&&<button type="button" disabled={!ready||sampling} onClick={()=>measure.current()}>{sampling?'Measuring scene…':'Measure scene performance'}</button>}{!publication&&report&&<section aria-label="Measured scene performance"><p>{report.sample.framesPerSecond.toFixed(1)} frames/s over {report.sample.elapsedMilliseconds.toFixed(0)} ms · {report.downloadBytes} downloaded bytes · {report.memory.sceneTypedArrayBytes} bytes of scene typed arrays. GPU memory is unknown.</p><p>Stationary view in this browser. This sample does not establish supported-device performance.</p><pre tabIndex={0} role="region" aria-label="Scene performance report" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:240,overflow:'auto'}}>{JSON.stringify(report,null,2)}</pre></section>}</>}</section>;
}
