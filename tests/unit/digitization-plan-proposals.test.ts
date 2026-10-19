import {expect,it} from 'vitest';
import {proposeInkLines} from '../../apps/api/src/inventory/digitization/plan-proposals';
it('proposes real dark horizontal and vertical runs, deduplicates thick bands and leaves gaps',()=>{
 const width=100,height=100,pixels=new Uint8Array(width*height).fill(255);
 for(let y=10;y<=12;y++)for(let x=10;x<80;x++)pixels[y*width+x]=0;
 for(let y=30;y<90;y++)pixels[y*width+85]=0;
 const lines=proposeInkLines(pixels,width,height);
 expect(lines).toEqual([{start:{x:10,y:10},end:{x:79,y:10}},{start:{x:85,y:30},end:{x:85,y:89}}]);
 pixels[10*width+45]=255;pixels[11*width+45]=255;pixels[12*width+45]=255;
 expect(proposeInkLines(pixels,width,height).some(line=>line.start.x===10&&line.end.x===79)).toBe(false);
});
it('blank sources abstain; tiny text runs and malformed or oversized rasters are rejected',()=>{
 const pixels=new Uint8Array(10000).fill(255);for(let i=0;i<8;i++)pixels[100+i]=0;
 expect(proposeInkLines(pixels,100,100)).toEqual([]);
 expect(()=>proposeInkLines(pixels,99,100)).toThrow();
 expect(()=>proposeInkLines(new Uint8Array(1025*1025),1025,1025)).toThrow();
});
