import type pg from 'pg';
import {digitizationEngineEnabled} from '@haven/contracts';
import {fail} from '../platform/core.js';

// Engine proposals also use the ordinary listing-review endpoints. Check these
// before source reads or idempotency replay, preserving stored proposals for later.
export async function requireAvailableRevision(c:pg.PoolClient,id:string){
 if(digitizationEngineEnabled)return;
 const revision=(await c.query('SELECT changes FROM listing_revisions WHERE id=$1',[id])).rows[0];
 if(revision?.changes?.digitizationPackage||revision?.changes?.unitFacts){
  fail(503,'The digitalization engine is temporarily disabled.','DIGITIZATION_DISABLED');
 }
}
