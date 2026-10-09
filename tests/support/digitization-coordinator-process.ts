// Actual isolated coordinator process for crash/reattachment integration proof.
import {createRequire} from 'node:module';
import {createDigitizationProcessor} from '../../apps/worker/src/digitization/coordinator';
const requireWorker=createRequire(new URL('../../apps/worker/package.json',import.meta.url));
const {Worker}=requireWorker('bullmq');
const redis=new URL(process.env.REDIS_URL!);
new Worker(process.env.COORDINATOR_TEST_QUEUE!,createDigitizationProcessor(process.env.COORDINATOR_TEST_API!,process.env.COORDINATOR_TEST_KEY!,{
 afterStart:async()=>{process.send?.({state:'started'});await new Promise<void>(()=>{/* Deliberate crash boundary before collection. */});}
}),{connection:{host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null},concurrency:1,lockDuration:1000,stalledInterval:1000});
