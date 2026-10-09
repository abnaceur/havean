/** Pure preparation of a plan-page selection. The save port must authorize the
 * committed source page and check the workspace version before persisting it.
 * Matrices map original source pixels to canonical editor pixels (Y upwards).
 */
export type PlanPageTransform={width:number;height:number;originalToModel:number[];modelToOriginal:number[]};
export function mapPlanPoint(matrix:readonly number[],point:{x:number;y:number}){
 if(matrix.length!==9||matrix.some(value=>!Number.isFinite(value))||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('PLAN_TRANSFORM_INVALID');
 const divisor=matrix[6]*point.x+matrix[7]*point.y+matrix[8];
 if(Math.abs(divisor)<1e-12)throw Error('PLAN_TRANSFORM_INVALID');
 return {x:(matrix[0]*point.x+matrix[1]*point.y+matrix[2])/divisor,y:(matrix[3]*point.x+matrix[4]*point.y+matrix[5])/divisor};
}
export function selectPlanPageTransform(width:number,height:number,originalToUpright:readonly number[],clockwiseDegrees:number):PlanPageTransform{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>30_000_000||!Number.isFinite(clockwiseDegrees)||Math.abs(clockwiseDegrees)>180)throw Error('PLAN_PAGE_BUDGET_INVALID');
 if(originalToUpright.length!==9||originalToUpright.some(value=>!Number.isFinite(value))||originalToUpright[6]!==0||originalToUpright[7]!==0||originalToUpright[8]!==1)throw Error('PLAN_TRANSFORM_INVALID');
 // The trusted decoder supplies normalized EXIF/PDF orientation, restricted to
 // orthogonal unit transforms. Arbitrary scale/shear must not enter deskew.
 const [a,b,c,d,e,f]=originalToUpright;
 if(![a,b,d,e].every(value=>[-1,0,1].includes(value))||Math.abs(a*e-b*d)!==1||a*a+d*d!==1||b*b+e*e!==1)throw Error('PLAN_TRANSFORM_INVALID');
 const corners=[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
 const normalized=corners.map(point=>mapPlanPoint(originalToUpright,{x:point.x/width,y:point.y/height}));
 if(normalized.some(point=>point.x<0||point.x>1||point.y<0||point.y>1))throw Error('PLAN_TRANSFORM_INVALID');
 const uprightWidth=a!==0?width:height,uprightHeight=e!==0?height:width;
 const angle=clockwiseDegrees*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 const upright=[a*uprightWidth/width,b*uprightWidth/height,c*uprightWidth,d*uprightHeight/width,e*uprightHeight/height,f*uprightHeight,0,0,1];
 const rotated=corners.map(point=>{const p=mapPlanPoint(upright,point);return {x:cos*p.x-sin*p.y,y:sin*p.x+cos*p.y};});
 const minX=Math.min(...rotated.map(point=>point.x)),minY=Math.min(...rotated.map(point=>point.y));
 const outputWidth=Math.max(...rotated.map(point=>point.x))-minX,outputHeight=Math.max(...rotated.map(point=>point.y))-minY;
 if(outputWidth*outputHeight>60_000_000)throw Error('PLAN_PAGE_BUDGET_INVALID');
 const matrix=[cos*upright[0]-sin*upright[3],cos*upright[1]-sin*upright[4],cos*upright[2]-sin*upright[5]-minX,-sin*upright[0]-cos*upright[3],-sin*upright[1]-cos*upright[4],outputHeight+minY-sin*upright[2]-cos*upright[5],0,0,1];
 const [m,n,o,p,q,r]=matrix,determinant=m*q-n*p;
 const inverse=[q/determinant,-n/determinant,(n*r-q*o)/determinant,-p/determinant,m/determinant,(p*o-m*r)/determinant,0,0,1];
 return {width:outputWidth,height:outputHeight,originalToModel:matrix,modelToOriginal:inverse};
}
