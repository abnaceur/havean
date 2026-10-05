import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
afterAll(()=>pool.end());
const buyer:Actor={id:'00000000-0000-4000-8000-000000000001',orgId:null,roles:['consumer']},other:Actor={id:'00000000-0000-4000-8000-000000000002',orgId:null,roles:['consumer']};
it('D03 suggestions are city-scoped, bounded, literal and exclude empty wildcard discovery',async()=>{
 for(const city of ['bj','sh']){const response=await fetch('http://localhost:8088/api/v1/search/suggest?'+new URLSearchParams({city,q:'a'}));expect(response.status).toBe(200);const result=await response.json();expect(result.data.length).toBeLessThanOrEqual(8);expect(result.data.every((x:any)=>x.city===city)).toBe(true);if(city==='bj')expect(result.data.length).toBeGreaterThan(0);}
 for(const q of ['','%','_']){const result=await fetch('http://localhost:8088/api/v1/search/suggest?'+new URLSearchParams({city:'bj',q})).then(r=>r.json());expect(result.data).toEqual([]);}
 expect((await fetch('http://localhost:8088/api/v1/search/suggest?q='+ 'a'.repeat(121))).status).toBe(400);
});
it('D03 account search history is isolated by database row policy for read, write and clear',async()=>{
 const marker='PRIVATE-HISTORY-'+crypto.randomUUID();const id=await transaction(buyer,async c=>(await c.query('INSERT INTO recent_searches(user_id,city,query) VALUES($1,\'bj\',$2) RETURNING id',[buyer.id,marker])).rows[0].id);
 try{expect((await transaction(other,c=>c.query('SELECT query FROM recent_searches WHERE id=$1',[id]))).rowCount).toBe(0);expect((await transaction(other,c=>c.query('DELETE FROM recent_searches WHERE id=$1',[id]))).rowCount).toBe(0);await expect(transaction(other,c=>c.query('INSERT INTO recent_searches(user_id,city,query) VALUES($1,\'bj\',$2)',[buyer.id,marker+'-other']))).rejects.toMatchObject({code:'42501'});expect((await transaction(buyer,c=>c.query('SELECT query FROM recent_searches WHERE id=$1',[id]))).rows[0].query).toBe(marker);}finally{await transaction(buyer,c=>c.query('DELETE FROM recent_searches WHERE id=$1',[id]));}
});
