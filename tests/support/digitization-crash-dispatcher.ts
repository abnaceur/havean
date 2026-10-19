import './env';
import {createRequire} from 'node:module';
import {pool} from '../../packages/database/src/index';
import {dispatchDigitizationEvents} from '../../apps/worker/src/digitization/coordinator';
const {Queue}=createRequire(new URL('../../apps/worker/package.json',import.meta.url))('bullmq'),queueName=process.env.DIGITIZATION_CRASH_QUEUE,eventId=process.env.DIGITIZATION_CRASH_EVENT;
if(process.env.HAVEN_CONTAINER_TESTS!=='true'||!queueName?.startsWith('crash-rehearsal-')||!eventId||!/^[a-f0-9-]{36}$/.test(eventId)||!process.send)throw Error('ISOLATED_CRASH_REHEARSAL_REQUIRED');
const redis=new URL(process.env.REDIS_URL!),queue=new Queue(queueName,{connection:{host:redis.hostname,port:Number(redis.port)||6379,maxRetriesPerRequest:null}});
await dispatchDigitizationEvents(pool,queue,{eventIds:[eventId],afterEnqueue:async id=>{process.send!({event:'enqueued',eventId:id});await new Promise(()=>{});}});
throw Error('CRASH_BOUNDARY_NOT_REACHED');
