import fs from 'node:fs';
import {beijingFixtures} from '../packages/test-support/src/fixtures';
const source=JSON.stringify(beijingFixtures(),null,2)+'\n',file='packages/test-support/fixtures/beijing.json';
fs.mkdirSync('packages/test-support/fixtures',{recursive:true});
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==source)throw Error('Fixture contract is stale');console.log('Deterministic English fixture contract verified');}
else{fs.writeFileSync(file,source);console.log('Generated deterministic synthetic Beijing fixtures');}
