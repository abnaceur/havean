import {expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compareBoxes,validateBaselines} from '../../scripts/visual-policy.mjs';
it('U06 a known twelve-pixel layout shift fails the four-pixel geometry gate',()=>{
 const box={x:16,y:120,width:358,height:240};expect(compareBoxes({gallery:box},{gallery:{...box,y:123}})).toBe(true);expect(()=>compareBoxes({gallery:box},{gallery:{...box,y:132}})).toThrow('Visual layout shift');
});
it('U06 missing approval or altered baseline bytes cannot pass the visual gate',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haven-visual-'));try{const file='fixture.png',bytes=Buffer.from('deterministic comparator boundary');fs.writeFileSync(path.join(dir,file),bytes);const screen={id:'home-390',route:'/bj',viewport:{width:390,height:844},file,sha256:createHash('sha256').update(bytes).digest('hex'),approved:false,approvedBy:null,approvedAt:null};const manifest={renderer:'pinned-fixture',maxDiffPixelRatio:0.005,screens:[screen]};expect(validateBaselines(manifest,dir,false)).toBe(1);expect(()=>validateBaselines(manifest,dir)).toThrow('awaiting human approval');fs.writeFileSync(path.join(dir,file),'changed bytes');expect(()=>validateBaselines(manifest,dir,false)).toThrow('Baseline changed without review');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
