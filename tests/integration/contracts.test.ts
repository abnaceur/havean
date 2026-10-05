import {describe,it,expect,vi,afterEach,beforeAll} from 'vitest';
import fs from 'node:fs';
import {operations} from '../../packages/contracts/src/generated/operations';
import {sdk} from '../../packages/contracts/src/generated/client';
import {ApiError} from '../../packages/contracts/src/transport';
const origin='http://localhost:8088',realFetch=globalThis.fetch;
afterEach(()=>vi.unstubAllGlobals());
beforeAll(async()=>{const deadline=Date.now()+20000;while(Date.now()<deadline){try{if((await realFetch(origin+'/api/v1/health/ready')).status===200)return;}catch{/* Retry only during bounded startup readiness. */}await new Promise(resolve=>setTimeout(resolve,200));}throw Error('API readiness did not succeed within 20 seconds');});
describe('F08 generated API contract',()=>{
 it('published OpenAPI matches generated operations exactly',async()=>{
  const response=await realFetch(origin+'/api/v1/openapi.json');expect(response.ok).toBe(true);
  const live=await response.json(),stored=JSON.parse(fs.readFileSync('packages/contracts/openapi.json','utf8'));
  expect(live).toEqual(stored);
  const ids=Object.values(live.paths).flatMap((path:any)=>Object.values(path).map((op:any)=>op.operationId));
  expect(ids.sort()).toEqual(Object.keys(operations).sort());
 });
 it('canonical generated client reads real public decimal-string inventory',async()=>{
  vi.stubGlobal('fetch',(input:string,init?:RequestInit)=>realFetch(new URL(input,origin),init));
  const result=await sdk.DiscoveryController_listings({query:{city:'bj',transaction:'sale',limit:2}});
  expect(result.data).toHaveLength(2);expect(result.meta?.limit).toBe(2);
  expect(typeof result.data[0].price).toBe('string');
  expect(result.data[0]).not.toHaveProperty('private_address');expect(result.data[0]).not.toHaveProperty('owner_id');
 });
 it('invalid range has a field error and stable request ID without private data',async()=>{
  const response=await realFetch(origin+'/api/v1/listings?minPrice=200&maxPrice=100');expect(response.status).toBe(400);
  const body=await response.json();expect(body.error.code).toBe('VALIDATION_ERROR');expect(body.error.fieldErrors.minPrice[0]).toContain('Minimum price');
  expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
  expect(JSON.stringify(body)).not.toMatch(/stack|SELECT|PRIVATE_FIXTURE|DATABASE_URL/);
 });
 it('canonical transport preserves typed server errors',async()=>{
  vi.stubGlobal('fetch',(input:string,init?:RequestInit)=>realFetch(new URL(input,origin),init));
  await expect(sdk.IdentityController_me({})).rejects.toBeInstanceOf(ApiError);
  await expect(sdk.IdentityController_me({})).rejects.toMatchObject({code:'AUTH_REQUIRED',status:401});
 });
 it('malformed JSON returns a sanitized client error',async()=>{
  const response=await realFetch(origin+'/api/v1/tools/mortgage-estimate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{not json'});
  expect(response.status).toBe(400);const body=await response.json();expect(body.error.requestId).toBeTruthy();expect(body.error.code).toBe('MALFORMED_REQUEST');expect(body.error).not.toHaveProperty('stack');
 });
});
