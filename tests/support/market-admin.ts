import type {FastifyRequest} from 'fastify';
import {GeographyController} from '../../apps/api/src/geography/administration';
import type {Identity} from '../../apps/api/src/platform/core';
export const marketAdmin=new GeographyController({actor:async()=>({id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']})} as unknown as Identity);
export function marketRequest(method='PATCH',url='/api/v1/ops/cities/bj/market'){return {method,url,headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest;}
export async function saveMarketPatch(patch:Record<string,unknown>){const {name:_oldName,...safePatch}=patch;const m=(await marketAdmin.marketRead(marketRequest(),'bj')).data;const {name:_name,...fields}=m.data;return (await marketAdmin.market(marketRequest(),'bj',{...fields,...safePatch,version:m.version,cityVersion:m.cityVersion})).data;}
