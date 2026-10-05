import fs from 'node:fs';
import {createOpenApi} from '../packages/contracts/src/openapi';
const source=JSON.stringify(createOpenApi(),null,2)+'\n',path='packages/contracts/openapi.json';
if(process.argv.includes('--check')){if(fs.readFileSync(path,'utf8')!==source)throw Error('OpenAPI contract is stale; run pnpm contracts:generate');console.log('OpenAPI matches canonical schemas');}
else{fs.writeFileSync(path,source);console.log('Generated OpenAPI from canonical schemas');}
