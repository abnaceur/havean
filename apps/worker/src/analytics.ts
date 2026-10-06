import {transaction} from '@haven/database';
import {workerActor} from './processor.js';
/** Stored projection port locks each source and marks it in the same transaction as its increment. */
export async function projectAnalytics(){return transaction(workerActor,async c=>(await c.query('SELECT project_analytics_batch(500) AS projected')).rows[0].projected as number);}
