import type {Actor} from '@haven/database';
import type pg from 'pg';
import {fail} from '../../platform/core.js';
/** Global agency reservations are checked inside a narrow database capability;
 * ordinary scoped SELECTs cannot see other actors' private intake runs. */
export async function requireRunBudget(c:pg.PoolClient,a:Actor,engine:string,budget:{maxSeconds:number;maxScratchBytes:string},excludeRun?:string){
 if(!a.orgId||!Number.isSafeInteger(budget.maxSeconds)||budget.maxSeconds<1||budget.maxSeconds>3600||!/^\d{1,13}$/.test(budget.maxScratchBytes)||BigInt(budget.maxScratchBytes)<1n||BigInt(budget.maxScratchBytes)>8589934592n)fail(422,'The requested processing budget exceeds supported limits.','RUN_BUDGET_EXCEEDED');
 const allowed=(await c.query('SELECT digitization_budget_capacity($1,$2,$3::numeric,$4) allowed',[engine,budget.maxSeconds,budget.maxScratchBytes,excludeRun??null])).rows[0].allowed;
 if(!allowed)fail(429,'The agency processing capacity is reserved. Retry after a current run finishes.','PROCESSING_QUOTA_EXCEEDED');
}
