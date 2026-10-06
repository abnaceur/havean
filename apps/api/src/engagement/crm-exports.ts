import {Controller,Get,Req,Query,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {leadExportQuery,viewingExportQuery} from '@haven/contracts';
import {Identity,transaction,data,fail} from '../platform/core.js';
import {crmAuthority,crmQueueRows} from './crm.js';
// RFC 4180 quoting is independent from formula neutralization, which applies to every cell.
// Control characters can precede spreadsheet formulas and must be checked deliberately.
// eslint-disable-next-line no-control-regex
export function csvCell(value:unknown){const raw=value==null?'':String(value),safe=/^[\s\u0000-\u001f]*[=+\-@]/u.test(raw)||/^[\t\r\n]/u.test(raw)?"'"+raw:raw;return '"'+safe.replaceAll('"','""')+'"';}
export function csvDocument(headers:string[],rows:unknown[][]){return [headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}
function report(kind:string,headers:string[],rows:unknown[][],team:boolean){if(rows.length>10000)fail(409,'Narrow your filters to export at most 10,000 records','EXPORT_TOO_LARGE');return data({filename:kind+'.csv',content:csvDocument(headers,rows),records:rows.length,generatedAt:new Date().toISOString(),scope:team?'team':'assigned'});}
@Controller('api/v1')
export class CrmExportsController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('ops/lead-queue/export') async leads(@Req() req:FastifyRequest,@Query() input:unknown){const x=leadExportQuery.parse(input),a=await this.identity.actor(req,['agent','agency_manager','developer','vendor','admin']);return transaction(a,async c=>{const auth=await crmAuthority(c,a),rows=await crmQueueRows(c,a,{...x,page:1},auth,10001,0);return report('inquiries',['Inquiry ID','Name','Email','Phone','Stage','Destination type','Destination ID','Agent ID','Created UTC','Version'],rows.map(r=>[r.id,r.name,r.email,r.phone,r.status,r.resource_type,r.resource_id,r.agent_id,new Date(r.created_at).toISOString(),r.version]),auth.team);});}
 @Get('ops/viewings/export') async viewings(@Req() req:FastifyRequest,@Query() input:unknown){const x=viewingExportQuery.parse(input),a=await this.identity.actor(req,['agent','agency_manager','admin']);return transaction(a,async c=>{const auth=await crmAuthority(c,a),rows=(await c.query('SELECT * FROM viewing_export_rows(true,$1,$2,$3)',[x.status??null,x.from??null,x.to??null])).rows;return report('viewings',['Viewing ID','Property','Status','Start UTC','End UTC','Property zone','Zone provenance','Agent ID','Version'],rows.map(r=>[r.id,r.title,r.status,new Date(r.start_at).toISOString(),new Date(r.end_at).toISOString(),r.time_zone,r.zone_source,r.agent_id,r.version]),auth.team);});}
}
