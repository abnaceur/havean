/** Shared binary codec: bounded degree-zero .splat xyz, scales, RGBA, wxyz.
 * Supported limits are explicit; a monolithic download is never streaming. */
export const SPLAT_PREVIEW_LIMIT=100000;
export function inspectSplat(bytes:ArrayBuffer){
 if(bytes.byteLength===0||bytes.byteLength%32||bytes.byteLength>32*SPLAT_PREVIEW_LIMIT)throw Error('Choose a nonempty scene tier within the preview budget.');
 const view=new DataView(bytes),count=bytes.byteLength/32,positions=new Float32Array(count*3),covariances=new Float32Array(count*6),colours=new Float32Array(count*4);
 const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];let visible=false;
 for(let index=0;index<count;index++){
  const offset=index*32,point=[0,1,2].map(axis=>view.getFloat32(offset+axis*4,true)),scale=[0,1,2].map(axis=>view.getFloat32(offset+12+axis*4,true));
  if(point.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)||scale.some(v=>!Number.isFinite(v)||v<=0||v>Math.exp(12)))throw Error('Scene positions and scales are outside the supported range.');
  const q=[0,1,2,3].map(axis=>(view.getUint8(offset+28+axis)-128)/128),length=Math.hypot(...q);if(length<1e-6)throw Error('Scene rotation is invalid.');
  const [w,x,y,z]=q.map(v=>v/length),r=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
  const covariance=(row:number,column:number)=>r[row].reduce((sum,v,axis)=>sum+v*r[column][axis]*scale[axis]**2,0);
  positions.set(point,index*3);covariances.set([covariance(0,0),covariance(0,1),covariance(0,2),covariance(1,1),covariance(1,2),covariance(2,2)],index*6);
  for(let channel=0;channel<4;channel++)colours[index*4+channel]=view.getUint8(offset+24+channel)/255;
  visible ||= colours[index*4+3]>0;
  const radius=3*Math.max(...scale);
  for(let axis=0;axis<3;axis++){minimum[axis]=Math.min(minimum[axis],point[axis]-radius);maximum[axis]=Math.max(maximum[axis],point[axis]+radius);}
 }
 if(!visible||minimum.some((v,axis)=>!Number.isFinite(v)||v>=maximum[axis]))throw Error('The scene has no visible bounded splats.');
 return {count,byteSize:bytes.byteLength,positions,covariances,colours,bounds:{min:minimum,max:maximum},unit:'arbitrary' as const,sphericalHarmonicDegree:0 as const};
}
