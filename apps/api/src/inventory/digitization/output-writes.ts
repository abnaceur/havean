import type {Actor} from '@haven/database';
import {transaction} from '../../platform/core.js';
import {prepareCpuExecution} from './execution-scope.js';
import {existingRenderReceipt} from './execution-results.js';

/** Register before any derived storage side effect. Each concurrent collector
 * owns a separate lease; all I/O ends two minutes before its cleanup boundary. */
export async function beginOutputWrite(a:Actor,engine:string,stage:string,execution:string,fence:string,asset:string){
 return transaction(a,async c=>{
  if(await existingRenderReceipt(c,a,engine,stage,execution,fence,asset))return null;
  const request=await prepareCpuExecution(c,a,engine,stage,execution,fence,asset);
  const writer=(await c.query(`INSERT INTO digitization_output_writes(digitization_id,organization_id,created_by,run_id,stage_id,execution_id,input_revision,asset_id,fencing_token,write_deadline,write_until)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,statement_timestamp()+interval '3 minutes',statement_timestamp()+interval '5 minutes') RETURNING id,version,write_deadline`,[engine,a.orgId,a.id,request.runId,stage,execution,request.inputRevision,asset,fence])).rows[0];
  return {id:writer.id as string,version:writer.version as number,signal:AbortSignal.timeout(Math.max(1,new Date(writer.write_deadline).getTime()-Date.now()))};
 });
}
export async function finishOutputWrite(a:Actor,writer:{id:string;version:number}){
 await transaction(a,c=>c.query('SELECT digitization_finish_output_write($1,$2)',[writer.id,writer.version]));
}
