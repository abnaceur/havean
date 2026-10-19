import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
import {maskTrainingFrame,trainingFrameTar} from '../../apps/api/src/inventory/digitization/frame-privacy-pixels';
const sharp=createRequire(new URL('../../apps/api/package.json',import.meta.url))('sharp');
it('removes sensitive pixel regions while retaining all outside pixels and canonical dimensions',async()=>{
 const raw=Buffer.alloc(32*24*3);for(let i=0;i<raw.length;i++)raw[i]=(i%200)+30;
 const source=await sharp(raw,{raw:{width:32,height:24,channels:3}}).png().toBuffer();
 const masked=await maskTrainingFrame(source,[{x:5,y:4,width:11,height:9},{x:14,y:10,width:5,height:5}]);
 const pixels=await sharp(masked.body).removeAlpha().raw().toBuffer();
 for(let y=0;y<24;y++)for(let x=0;x<32;x++)for(let c=0;c<3;c++)expect(pixels[(y*32+x)*3+c]).toBe((x>=5&&x<16&&y>=4&&y<13)||(x>=14&&x<19&&y>=10&&y<15)?0:raw[(y*32+x)*3+c]);
 expect(masked.sha256).not.toBe(masked.sourceSha256);expect(masked.body.equals((await maskTrainingFrame(source,[{x:5,y:4,width:11,height:9},{x:14,y:10,width:5,height:5}])).body)).toBe(true);
 const metadata=await sharp(masked.body).metadata();expect(metadata.width).toBe(32);expect(metadata.height).toBe(24);expect(metadata.exif).toBeUndefined();
});
it('rejects invalid bounds, fractional rectangles, oversized inputs and noncanonical formats',async()=>{
 const source=await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer();
 for(const box of [{x:15,y:0,width:2,height:1},{x:0.5,y:0,width:1,height:1},{x:0,y:0,width:0,height:1}])await expect(maskTrainingFrame(source,[box])).rejects.toMatchObject({status:422});
 await expect(maskTrainingFrame(await sharp(source).jpeg().toBuffer(),[])).rejects.toMatchObject({status:422});
 await expect(maskTrainingFrame(await sharp(source).withExif({IFD0:{ImageDescription:'sensitive'}}).png().toBuffer(),[])).rejects.toMatchObject({status:422});
});
it('writes deterministic bounded private TAR entries without excluded frame files or path traversal',()=>{
 const entries=[{name:'manifest.json',body:Buffer.from('{"privacyReviewRequired":true}')},{name:'frames/11111111-1111-4111-8111-111111111111.png',body:Buffer.from('masked pixels')}];
 const tar=trainingFrameTar(entries);expect(tar.equals(trainingFrameTar(entries))).toBe(true);
 let offset=0;const names:string[]=[];while(tar[offset]){const header=tar.subarray(offset,offset+512);names.push(header.subarray(0,100).toString().split('\0')[0]);const size=parseInt(header.subarray(124,136).toString(),8);const stored=parseInt(header.subarray(148,154).toString(),8);header.fill(32,148,156);expect(header.reduce((sum,byte)=>sum+byte,0)).toBe(stored);offset+=512+Math.ceil(size/512)*512;}
 expect(names).toEqual(entries.map(e=>e.name));expect(()=>trainingFrameTar([{name:'../secret',body:Buffer.alloc(1)}])).toThrow();expect(()=>trainingFrameTar([entries[0],entries[0]])).toThrow();expect(()=>trainingFrameTar([{name:'manifest.json',body:Buffer.alloc(32*1024*1024)}])).toThrow();
});
