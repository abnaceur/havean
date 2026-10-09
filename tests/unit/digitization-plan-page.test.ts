import {expect,it} from 'vitest';
import {mapPlanPoint,selectPlanPageTransform} from '../../apps/api/src/inventory/digitization/plan-page';
it('maps original pixels through orientation and rotation into Y-up editor geometry with a reversible overlay',()=>{
 const upright=selectPlanPageTransform(400,200,[1,0,0,0,1,0,0,0,1],0);
 expect(mapPlanPoint(upright.originalToModel,{x:100,y:50})).toEqual({x:100,y:150});
 const rotated=selectPlanPageTransform(400,200,[1,0,0,0,1,0,0,0,1],90);
 expect(rotated.width).toBeCloseTo(200);expect(rotated.height).toBeCloseTo(400);
 const point=mapPlanPoint(rotated.originalToModel,{x:100,y:50});expect(point.x).toBeCloseTo(150);expect(point.y).toBeCloseTo(300);
 const exif=selectPlanPageTransform(400,200,[0,-1,1,1,0,0,0,0,1],0);
 expect(exif.width).toBe(200);expect(exif.height).toBe(400);
 expect(mapPlanPoint(exif.originalToModel,{x:100,y:50})).toEqual({x:150,y:300});
 for(const orientation of [[1,0,0,0,1,0,0,0,1],[-1,0,1,0,1,0,0,0,1],[0,-1,1,1,0,0,0,0,1]])for(const angle of [-179,-12.5,0,90,180]){
  const transform=selectPlanPageTransform(400,200,orientation,angle);
  for(const source of [{x:0,y:0},{x:400,y:200},{x:73,y:119}]){
   const editor=mapPlanPoint(transform.originalToModel,source),restored=mapPlanPoint(transform.modelToOriginal,editor);
   expect(editor.x).toBeGreaterThanOrEqual(-1e-8);expect(editor.x).toBeLessThanOrEqual(transform.width+1e-8);
   expect(editor.y).toBeGreaterThanOrEqual(-1e-8);expect(editor.y).toBeLessThanOrEqual(transform.height+1e-8);
   expect(restored.x).toBeCloseTo(source.x,8);expect(restored.y).toBeCloseTo(source.y,8);
  }
 }
});
it('rejects invalid source extents, projective/sheared orientation and unbounded rotation',()=>{
 const identity=[1,0,0,0,1,0,0,0,1];
 expect(()=>selectPlanPageTransform(0,200,identity,0)).toThrow('PLAN_PAGE_BUDGET_INVALID');
 expect(()=>selectPlanPageTransform(10000,10000,identity,0)).toThrow('PLAN_PAGE_BUDGET_INVALID');
 expect(()=>selectPlanPageTransform(400,200,identity,181)).toThrow('PLAN_PAGE_BUDGET_INVALID');
 for(const matrix of [[1,1,0,0,1,0,0,0,1],[1,0,2,0,1,0,0,0,1],[1,0,0,0,1,0,1,0,1]])expect(()=>selectPlanPageTransform(400,200,matrix,0)).toThrow('PLAN_TRANSFORM_INVALID');
 expect(()=>mapPlanPoint(identity,{x:Infinity,y:0})).toThrow('PLAN_TRANSFORM_INVALID');
});
