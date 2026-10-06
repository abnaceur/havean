import '../support/env';
import {it,expect,afterAll} from 'vitest';
import {createServer} from 'node:http';
import {pool} from '../../packages/database/src/index';
import {searchListings} from '../../apps/api/src/geography/search';
import {listingFilters} from '../../packages/contracts/src/index';
afterAll(()=>pool.end());
it('Q07 concurrent identical searches share only a pending real index request; subsequent reads recheck the native provider',async()=>{
 let requests=0;const proxy=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests++;await new Promise(r=>setTimeout(r,200));const native=await fetch(process.env.SEARCH_URL+req.url!,{method:req.method,headers:{Authorization:'Bearer '+process.env.SEARCH_KEY,'Content-Type':'application/json'},body:Buffer.concat(chunks).toString('utf8')});res.writeHead(native.status,{'Content-Type':'application/json'});res.end(Buffer.from(await native.arrayBuffer()));}catch{res.writeHead(502);res.end('{}');}});
 await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));const address=proxy.address() as {port:number},url='http://127.0.0.1:'+address.port,criteria=listingFilters.parse({city:'bj',transaction:'sale',sort:'newest',minPrice:'9.01',maxPrice:'9.01'});
 try{const replies=await Promise.all(Array.from({length:20},()=>searchListings(criteria,url)));expect(requests).toBe(1);for(const reply of replies){expect(reply.data).toEqual([]);expect(reply.meta).toMatchObject({total:0,searchMode:'meilisearch',degraded:false});}await searchListings(criteria,url);expect(requests).toBe(2);}finally{proxy.closeAllConnections();await new Promise<void>((resolve,reject)=>proxy.close(e=>e?reject(e):resolve()));}
});
