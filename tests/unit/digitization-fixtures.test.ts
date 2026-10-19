import {afterEach,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateDigitizationFixtures} from '../../scripts/digitization-fixtures.mjs';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
function fixture(change:(manifest:any)=>void){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haven-fixture-provenance-'));roots.push(root);fs.mkdirSync(path.join(root,'docs/digitization'),{recursive:true});
 const manifest={schemaVersion:1,label:'O/R/P/V',fixtures:[{id:'authored',provenance:'Authored software fixture',rights:'Project authored',limits:'No hardware acceptance',generators:['generator.ts']},{id:'licensed',provenance:'Third-party capture',limits:'Investigation only',license:'CC-BY-4.0',source:'https://example.test/publisher',attribution:'Fixture publisher',archiveSha256:'a'.repeat(64)}]};
 fs.writeFileSync(path.join(root,'generator.ts'),'// Authored fixture');change(manifest);fs.writeFileSync(path.join(root,'docs/digitization/fixture-provenance.json'),JSON.stringify(manifest));return root;
}
it('requires actual confined generators and explicit third-party rights',()=>{
 expect(validateDigitizationFixtures()).toEqual({count:8});
 expect(()=>validateDigitizationFixtures(fixture(m=>{delete m.fixtures[0].rights;}))).toThrow('rights');
 expect(()=>validateDigitizationFixtures(fixture(m=>{m.fixtures[0].generators=['../private'];}))).toThrow('path');
 expect(()=>validateDigitizationFixtures(fixture(m=>{m.fixtures[1].archiveSha256='unverified';}))).toThrow('archive pin');
 expect(()=>validateDigitizationFixtures(fixture(m=>{delete m.fixtures[1].license;}))).toThrow('license');
});
