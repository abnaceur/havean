import {modelVertices,projectModel,type ModelFloor,type ModelCamera} from './spatial-model';

export type ModelPanorama={id:string;url:string};
type Callbacks={aspect:(value:number)=>void;ready:()=>void;textures:(loaded:number,total:number,failed:number)=>void};
/** Approved panoramas decorate supplied room shells. No depth is inferred. */
export function createTourModelRenderer(canvas:HTMLCanvasElement,floors:ModelFloor[],panoramas:ModelPanorama[],callbacks:Callbacks){
 const gl=canvas.getContext('webgl',{alpha:false,antialias:true});if(!gl)throw Error('3D rendering is unavailable. Use the interactive floor plan to explore rooms.');
 let alive=true,program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null;
 const images:HTMLImageElement[]=[],textures:WebGLTexture[]=[],shaders:WebGLShader[]=[];
 let pose:ModelCamera={yaw:-30,pitch:50,zoom:1.3},loaded=0,failed=0;
 const rooms=floors.flatMap(floor=>floor.spatial.rooms.map(room=>{
  // Interior wall faces and upward-facing floor triangles make a cutaway shell.
  let polygon=room.polygon;const area=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p.x*q.y-q.x*p.y;},0);if(area<0)polygon=[...polygon].reverse();
  const vertices=modelVertices([{...floor,spatial:{...floor.spatial,rooms:[{...room,polygon}]}}]);
  for(let i=0;i<(polygon.length-2)*3;i+=3)[vertices[i+1],vertices[i+2]]=[vertices[i+2],vertices[i+1]];
  const layout=floor.spatial,source=panoramas.find(p=>p.id===room.sceneId);
  return {vertices,source,texture:null as WebGLTexture|null,camera:[(room.camera.x-.5)*layout.widthMetres,layout.elevationMetres+Math.min(1.6,room.heightMetres*.6),(room.camera.y-.5)*layout.depthMetres],heading:room.camera.headingDegrees*Math.PI/180};
 }));
 const total=rooms.filter(room=>room.source).length;
 const dispose=()=>{alive=false;for(const image of images){image.onload=null;image.onerror=null;image.src='';}for(const texture of textures)gl.deleteTexture(texture);for(const shader of shaders)gl.deleteShader(shader);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);};
 try{
  const shader=(type:number,source:string)=>{const value=gl.createShader(type);if(!value)throw Error('Shader allocation failed');shaders.push(value);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error('Shader compilation failed');return value;};
  program=gl.createProgram();if(!program)throw Error('Model program allocation failed');
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec4 clip;attribute vec3 world;attribute vec3 color;varying vec3 surface;varying vec3 tint;void main(){gl_Position=clip;surface=world;tint=color;}`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec3 surface;varying vec3 tint;uniform sampler2D panorama;uniform bool textured;uniform vec3 eye;uniform float heading;void main(){if(!textured){gl_FragColor=vec4(tint,1.);return;}vec3 ray=normalize(surface-eye);float longitude=atan(ray.x,-ray.z)-heading;vec2 uv=vec2(fract(longitude/6.28318530718+.5),asin(clamp(ray.y,-1.,1.))/3.14159265359+.5);gl_FragColor=vec4(texture2D(panorama,uv).rgb,1.);}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Model program initialization failed');gl.useProgram(program);
  buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  for(const [name,size,offset] of [['clip',4,0],['world',3,16],['color',3,28]] as const){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,40,offset);}
  const textured=gl.getUniformLocation(program,'textured'),eye=gl.getUniformLocation(program,'eye'),heading=gl.getUniformLocation(program,'heading');
  gl.uniform1i(gl.getUniformLocation(program,'panorama'),0);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
  // A valid neutral sampler keeps untextured and failed-image rooms drawable.
  const neutral=gl.createTexture()!;textures.push(neutral);gl.bindTexture(gl.TEXTURE_2D,neutral);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([220,218,207,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  const draw=(camera:ModelCamera)=>{
   if(!alive)return;pose=camera;
   const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),ratio=Math.min(devicePixelRatio||1,2),aspect=width/height;
   canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);callbacks.aspect(aspect);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.09,.14,.16,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   for(const room of rooms){
    const data=new Float32Array(room.vertices.flatMap(vertex=>{
     const [x,y,z]=projectModel(vertex.point,floors,pose,aspect);
     // projectModel's depth encodes the perspective denominator; reconstruct its
     // proportional w so world positions interpolate correctly across triangles.
     const w=Math.max(.001,z+1);return [x*w,y*w,z*w,w,...vertex.point,...vertex.color];
    }));
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,room.texture||neutral);gl.uniform1i(textured,room.texture?1:0);gl.uniform3f(eye,room.camera[0],room.camera[1],room.camera[2]);gl.uniform1f(heading,room.heading);gl.drawArrays(gl.TRIANGLES,0,room.vertices.length);
   }
   callbacks.ready();
  };
  callbacks.textures(0,total,0);
  for(const room of rooms){if(!room.source)continue;const image=new Image();images.push(image);let settled=false;const fail=()=>{if(!alive||settled)return;settled=true;failed++;callbacks.textures(loaded,total,failed);};
   image.onload=()=>{if(!alive||settled)return;try{
    if(image.naturalWidth<1024||Math.abs(image.naturalWidth/image.naturalHeight-2)>.05)throw Error('Invalid panorama dimensions');
    const max=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),2048,Math.floor(Math.sqrt(32*1024*1024*2/(4*Math.max(1,total))))),scale=Math.min(1,max/image.naturalWidth);let source:TexImageSource=image;
    if(scale<1){const reduced=document.createElement('canvas');reduced.width=Math.round(image.naturalWidth*scale);reduced.height=Math.round(image.naturalHeight*scale);const context=reduced.getContext('2d');if(!context)throw Error('Texture resizing failed');context.drawImage(image,0,0,reduced.width,reduced.height);source=reduced;}
    const texture=gl.createTexture();if(!texture)throw Error('Texture allocation failed');textures.push(texture);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Texture upload failed');room.texture=texture;settled=true;loaded++;callbacks.textures(loaded,total,failed);draw(pose);
   }catch{fail();}};image.onerror=fail;image.src=room.source.url;
  }
  return {draw,dispose};
 }catch(error){dispose();throw error;}
}
