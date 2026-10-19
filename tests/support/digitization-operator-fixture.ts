import './env';
import {writeFileSync} from 'node:fs';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createIntake} from '../../apps/api/src/inventory/digitization/intakes';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']};
try{for(const project of ['desktop','mobile']){const workspace=await transaction(actor,c=>createIntake(c,actor));writeFileSync(`infra/generated/integration/operator-processing-${project}.json`,JSON.stringify({engineId:workspace.id}));}}finally{await pool.end();}
