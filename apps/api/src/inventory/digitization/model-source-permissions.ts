import type pg from 'pg';
import type {Actor} from '@haven/database';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {fail} from '../../platform/core.js';
import {digitizationModelSourcePermissionScope,digitizationDelegatedSources} from '@haven/contracts';
/** The database projection returns only this owner's source permissions. It
 * never returns another owner's document, original object key or source text. */
export async function readModelSourcePermissionScope(c:pg.PoolClient,engineId:string){
 const scope=(await c.query('SELECT digitization_model_source_permission_scope($1) scope',[engineId])).rows[0].scope;
 return digitizationModelSourcePermissionScope.parse({...scope,grants:scope.grants.map((grant:any)=>({...grant,expiresAt:new Date(grant.expiresAt).toISOString()}))});
}

export async function readDelegatedSources(c:pg.PoolClient,a:Actor,engineId:string){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engineId);
 if(w.target.type!=='listing')fail(422,'Owner source binding requires a current listing.','LISTING_REQUIRED');
 return digitizationDelegatedSources.parse((await c.query('SELECT digitization_delegated_source_scope($1) scope',[engineId])).rows[0].scope);
}
