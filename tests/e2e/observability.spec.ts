import {test,expect} from '@playwright/test';
import {login} from '../support/browser';
test('F13 readiness, tracing and operational metrics are scoped to administrators',async({page})=>{
 const live=await page.request.get('/api/v1/health/live');expect(live.status()).toBe(200);expect((await live.json()).data.status).toBe('up');
 const ready=await page.request.get('/api/v1/health/ready');expect(ready.status()).toBe(200);expect((await ready.json()).data).toEqual({status:'ready',database:'up',migrations:'current'});
 expect(ready.headers()['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
 expect((await page.request.get('/api/v1/health/metrics')).status()).toBe(401);
 await login(page,'buyer');expect((await page.request.get('/api/v1/health/metrics')).status()).toBe(403);
 await login(page,'admin','http://localhost:8089','/ops');
 const metrics=await page.request.get('http://localhost:8089/api/v1/health/metrics');expect(metrics.status()).toBe(200);
 const body=(await metrics.json()).data;expect(body.outbox.pending).toBeGreaterThanOrEqual(0);expect(body.queue).not.toBeNull();expect(body.queue.completed).toBeGreaterThanOrEqual(0);expect(body.requests.length).toBeGreaterThan(0);expect(JSON.stringify(body)).not.toMatch(/Bearer|password|email|encrypted_tokens|haven_session/);
});
