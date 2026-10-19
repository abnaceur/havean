import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function validateDigitizationFixtures(root=process.cwd()){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/digitization/fixture-provenance.json'),'utf8'));
 if(manifest.schemaVersion!==1||manifest.label!=='O/R/P/V'||!Array.isArray(manifest.fixtures)||!manifest.fixtures.length)throw Error('Invalid fixture provenance manifest');
 const ids=new Set(),base=fs.realpathSync(root);
 for(const fixture of manifest.fixtures){
  if(typeof fixture.id!=='string'||!/^[a-z0-9-]+$/.test(fixture.id)||ids.has(fixture.id))throw Error('Invalid or duplicate fixture ID');
  ids.add(fixture.id);
  if(!fixture.provenance?.trim()||!fixture.limits?.trim())throw Error('Fixture provenance and limitations are required');
  if(fixture.generators){
   if(!fixture.rights?.trim()||!Array.isArray(fixture.generators)||!fixture.generators.length)throw Error('Authored fixture rights and generators are required');
   for(const generator of fixture.generators){
    if(typeof generator!=='string'||path.isAbsolute(generator)||generator.split('/').includes('..'))throw Error('Invalid fixture generator path');
    const relative=path.relative(base,fs.realpathSync(path.join(base,generator)));
    if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.statSync(path.join(base,generator)).isFile())throw Error('Fixture generator escapes checkout');
   }
  }else if(!fixture.license?.trim()||!fixture.attribution?.trim()||!/^https:\/\//.test(fixture.source)||!/^[a-f0-9]{64}$/.test(fixture.archiveSha256))throw Error('Third-party fixture license, attribution, source and archive pin are required');
 }
 return {count:ids.size};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log('Validated '+validateDigitizationFixtures().count+' fixture provenance records; this does not approve hardware or property accuracy.');
