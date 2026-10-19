import {describe,it,expect} from 'vitest';
import {inspectSplat,SPLAT_PREVIEW_LIMIT} from '../../packages/contracts/src/digitization-splat';
function bytes(){const result=new ArrayBuffer(64),view=new DataView(result);for(let i=0;i<2;i++){for(let axis=0;axis<3;axis++){view.setFloat32(i*32+axis*4,i+axis,true);view.setFloat32(i*32+12+axis*4,[.2,.3,.4][axis],true);}new Uint8Array(result).set([128,64,255,128,255,128,128,128],i*32+24);}return result;}
describe('splat32 binary viewer profile',()=>{
 it('decodes actual little-endian xyz, linear covariance, RGBA and wxyz without a metric claim',()=>{
  const result=inspectSplat(bytes());expect(result.count).toBe(2);expect([...result.positions]).toEqual([0,1,2,1,2,3]);
  expect(result.covariances[0]).toBeCloseTo(.04);expect(result.covariances[3]).toBeCloseTo(.09);expect(result.covariances[5]).toBeCloseTo(.16);expect(result.colours[3]).toBeCloseTo(128/255);expect(result.unit).toBe('arbitrary');
 });
 it('rejects nonfinite, zero rotations, invisible scenes, truncated and over-budget data',()=>{
  for(const kind of ['nan','zero-scale','zero-rotation','invisible']){const body=bytes(),v=new DataView(body);if(kind==='nan')v.setFloat32(0,NaN,true);if(kind==='zero-scale')v.setFloat32(12,0,true);if(kind==='zero-rotation')new Uint8Array(body).fill(128,28,32);if(kind==='invisible'){v.setUint8(27,0);v.setUint8(59,0);}expect(()=>inspectSplat(body)).toThrow();}
  expect(()=>inspectSplat(new ArrayBuffer(0))).toThrow();expect(()=>inspectSplat(new ArrayBuffer(31))).toThrow();expect(()=>inspectSplat(new ArrayBuffer((SPLAT_PREVIEW_LIMIT+1)*32))).toThrow();
 });
});
