import './env';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pool} from '../../packages/database/src/index';
import {createDigitizationProcessor,dispatchDigitizationEvents} from '../../apps/worker/src/digitization/coordinator';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN;
if(!origin||process.env.HAVEN_CONTAINER_TESTS!=='true')throw Error('Isolated runner required');
const requireWorker=createRequire(new URL('../../apps/worker/package.json',import.meta.url)),{Queue,Worker}=requireWorker('bullmq');
const directory=await mkdtemp(join(tmpdir(),'haven-operator-')),signingFile=join(directory,'test-key');
await writeFile(signingFile,'test-only-private-key-not-a-production-credential-0000',{mode:0o600});
const testKey='3'.repeat(64),apiOrigin='http://127.0.0.1:9941';
const child=spawn(process.execPath,['--import','tsx','apps/api/src/main.ts'],{env:{...process.env,TSX_TSCONFIG_PATH:'apps/api/tsconfig.json',API_PORT:'9941',DIGITIZATION_COORDINATOR_KEY:testKey,DIGITIZATION_CPU_RUNNER_ORIGIN:origin,DIGITIZATION_CPU_SIGNING_KEY_FILE:signingFile},stdio:['ignore','ignore','ignore']});
const redis=new URL(process.env.REDIS_URL!),connection={host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null},queueName='operator-browser-'+crypto.randomUUID(),queue=new Queue(queueName,{connection});
let worker:any,stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
try{
 const prefix=process.env.DIGITIZATION_OPERATOR_FIXTURE_PREFIX??'operator-processing';if(!['operator-processing','unit-application','capture-source'].includes(prefix))throw Error('ISOLATED_OPERATOR_FIXTURE_REQUIRED');
 const engines=await Promise.all(['desktop','mobile'].map(async p=>JSON.parse(await readFile(`infra/generated/integration/${prefix}-${p}.json`,'utf8')).engineId));
 const deadline=Date.now()+20000;
 for(;;){if(child.exitCode!==null)throw Error('OPERATOR_COORDINATOR_START_FAILED');try{if((await fetch(apiOrigin+'/api/v1/health/live',{signal:AbortSignal.timeout(500)})).ok)break;}catch{/* Retry isolated API readiness within its deadline. */}if(Date.now()>deadline)throw Error('OPERATOR_COORDINATOR_NOT_READY');await new Promise(resolve=>setTimeout(resolve,100));}
 worker=new Worker(queueName,createDigitizationProcessor(apiOrigin,testKey),{connection,concurrency:1});
 worker.on('failed',(_job:any,error:Error)=>process.stderr.write('Operator test execution failed: '+error.message+'\n'));
 await writeFile('/tmp/haven-operator-coordinator-ready','ready');
 const stopAt=Date.now()+180000;
 while(!stopping&&Date.now()<stopAt){if(await access('/tmp/haven-operator-coordinator-stop').then(()=>true,()=>false))break;const ids=(await pool.query("SELECT id FROM outbox WHERE aggregate_id=ANY($1::uuid[]) AND kind LIKE 'digitization.%' AND processed_at IS NULL",[engines])).rows.map(row=>row.id);if(ids.length)await dispatchDigitizationEvents(pool,queue,{eventIds:ids});await new Promise(resolve=>setTimeout(resolve,250));}
}finally{await rm('/tmp/haven-operator-coordinator-ready',{force:true});await rm('/tmp/haven-operator-coordinator-stop',{force:true});await worker?.close();await queue.obliterate({force:true});await queue.close();child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null?resolve(null):child.once('exit',resolve));await pool.end();await rm(directory,{recursive:true,force:true});}
