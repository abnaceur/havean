import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import type {FastifyRequest} from 'fastify';
import type {Identity} from '../../apps/api/src/platform/core';
import {GeographyController} from '../../apps/api/src/geography/administration';
import {AdministrationController} from '../../apps/api/src/administration/controller';
import {transaction,type Actor} from '../../packages/database/src/index';
const admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
const identity=(actor=admin)=>({actor:async()=>actor} as unknown as Identity),api=new GeographyController(identity()),content=new AdministrationController(identity());
const {Pool}=createRequire(new URL('../../packages/database/package.json',import.meta.url))('pg'),fixtures=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL});afterAll(()=>fixtures.end());
const request=(url='/api/v1/ops/geography/cities',method='POST')=>({method,url,headers:{'idempotency-key':crypto.randomUUID()}} as unknown as FastifyRequest);
it('Q04 native city creation atomically initializes four versioned categories with exact original author/time/history and one replay receipt',async()=>{
 const input={kind:'cities',name:'Q04 synthetic city',slug:'q04-'+crypto.randomUUID(),aliases:[],country:'NZ',currency:'NZD',timezone:'Pacific/Auckland'},req=request(),city=(await api.create(req,'cities',input)).data;
 expect((await api.create(req,'cities',input)).data.id).toBe(city.id);const rows=(await content.homeContent(request('/api/v1/ops/home-content','GET'),{city:input.slug})).data.taxonomy;expect(rows.map(r=>r.category).sort()).toEqual(['buy','commercial','new-homes','rent']);expect(rows.every(r=>r.version===1&&r.active&&!r.historical)).toBe(true);
 const history=await transaction(admin,c=>c.query('SELECT h.actor_id,h.at=t.updated_at exact_time,h.snapshot=to_jsonb(t) exact_snapshot FROM home_taxonomy_history h JOIN home_taxonomy t USING(city,category,version) WHERE h.city=$1',[input.slug]));expect(history.rows).toHaveLength(4);expect(history.rows.every(r=>r.actor_id===admin.id&&r.exact_time&&r.exact_snapshot)).toBe(true);
 await expect(new GeographyController(identity({id:'00000000-0000-4000-8000-000000000001',orgId:null,roles:['admin']})).create(request(),'cities',{...input,slug:'forged-'+crypto.randomUUID()})).rejects.toMatchObject({status:403});
});
it('Q04 cold seed includes editable categories and a trusted replay preserves existing native labels, state, versions and original activity',async()=>{
 const original=(await content.homeContent(request('/api/v1/ops/home-content','GET'),{city:'bj'})).data.taxonomy;expect(original.map(r=>r.category).sort()).toEqual(['buy','commercial','new-homes','rent']);const old=original.find(r=>r.category==='buy')!;
 const changed=(await content.homeTaxonomy(request('/api/v1/ops/home-taxonomy'),{city:'bj',category:'buy',version:old.version,label:'Q04 preserved editorial label',active:old.active})).data;
 try{const before=(await fixtures.query("SELECT to_jsonb(t) row FROM home_taxonomy t ORDER BY city,category")).rows,history=(await fixtures.query('SELECT to_jsonb(h) row FROM home_taxonomy_history h ORDER BY id')).rows;execFileSync('pnpm',['db:seed'],{env:process.env,stdio:'pipe',timeout:120000});expect((await fixtures.query('SELECT to_jsonb(t) row FROM home_taxonomy t ORDER BY city,category')).rows).toEqual(before);expect((await fixtures.query('SELECT to_jsonb(h) row FROM home_taxonomy_history h ORDER BY id')).rows).toEqual(history);}finally{await content.homeTaxonomy(request('/api/v1/ops/home-taxonomy'),{city:'bj',category:'buy',version:changed.version,label:old.label,active:old.active});}
});
