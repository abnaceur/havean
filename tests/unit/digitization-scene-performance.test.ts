import {expect,it} from 'vitest';
import {sceneFrameSample} from '../../packages/ui/src/splat-performance';
it('reports slow-frame tails and elapsed render cadence rather than the configured display refresh rate',()=>{
 expect(sceneFrameSample([100,110,120,130,230])).toEqual({frames:4,elapsedMilliseconds:130,framesPerSecond:4000/130,frameIntervalP50Milliseconds:10,frameIntervalP95Milliseconds:100});
});
it('refuses empty, repeated, reversed and nonfinite samples',()=>{
 for(const sample of [[],[0,1],[0,1,1],[0,2,1],[0,1,NaN],[0,1,Infinity]])expect(()=>sceneFrameSample(sample)).toThrow();
});
