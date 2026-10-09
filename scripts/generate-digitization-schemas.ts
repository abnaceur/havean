import fs from 'node:fs';
import {digitizationTransportSchemas} from '../packages/contracts/src/digitization';
const target='services/property-processing/schemas/digitization.schema.json';
const source=JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',description:'Generated transport shapes. API Zod and inventory validators remain authoritative for cross-reference, metric/evidence/review and authorization checks. Do not edit.',$defs:digitizationTransportSchemas()},null,2)+'\n';
if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==source)throw Error('Digitization schemas are stale; run pnpm contracts:generate');console.log('Digitization runner schemas match canonical contracts');}
else{fs.mkdirSync('services/property-processing/schemas',{recursive:true});fs.writeFileSync(target,source);console.log('Generated digitization runner schemas');}
