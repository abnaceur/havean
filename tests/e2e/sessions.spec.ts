import '../support/env';
import {test,expect,request,type Page} from '@playwright/test';
import {pool} from '../../packages/database/src/index';
import {completeOtp} from '../support/totp';

async function signIn(page:Page){
  await page.goto('/api/v1/auth/login?prompt=login&returnTo=/account');
  await expect(page.getByRole('heading',{name:'Sign in to your account'})).toBeVisible();
  if(await page.getByRole('button',{name:'Restart login'}).isVisible())await page.getByRole('button',{name:'Restart login'}).click();
  await page.getByRole('textbox',{name:'Username or email'}).fill('buyer');
  await page.getByLabel('Password',{exact:true}).fill(process.env.DEV_PASSWORD!);
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8088/account');
  return (await page.context().cookies()).find(c=>c.name==='haven_session')!.value;
}

test.afterAll(async()=>{await pool.end();});
test('F06 staff password alone is insufficient; verified OTP grants access',async({page})=>{
  await page.goto('http://localhost:8089/api/v1/auth/login?prompt=login&returnTo=/ops');
  await page.getByRole('textbox',{name:'Username or email'}).fill('developer');
  await page.getByLabel('Password',{exact:true}).fill(process.env.DEV_PASSWORD!);
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await expect(page.getByLabel('One-time code',{exact:true})).toBeVisible();
  expect((await page.context().cookies()).find(c=>c.name==='haven_session')).toBeUndefined();
  await page.getByLabel('One-time code',{exact:true}).fill('invalid');
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await expect(page.getByText('Invalid authenticator code.',{exact:true})).toBeVisible();
  await completeOtp(page,'developer');
  await expect(page).toHaveURL('http://localhost:8089/ops');
  const me=await page.request.get('http://localhost:8089/api/v1/me');
  expect(me.ok()).toBe(true);
  expect((await me.json()).data.roles).toContain('developer');
});
test('F06 session rotation, expired-session denial and provider logout',async({page})=>{
  const first=await signIn(page),second=await signIn(page);
  expect(second).not.toBe(first);
  const old=await request.newContext({baseURL:'http://localhost:8088',extraHTTPHeaders:{Cookie:'haven_session='+first}});
  expect((await old.get('/api/v1/me')).status()).toBe(401);
  await old.dispose();
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[second]);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  const active=await signIn(page);
  const logout=await page.request.post('/api/v1/auth/logout',{headers:{Origin:'http://localhost:8088'}});
  expect(logout.ok()).toBe(true);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  expect((await pool.query('SELECT 1 FROM sessions WHERE id=$1',[active])).rowCount).toBe(0);
  await page.goto('/api/v1/auth/login?returnTo=/account');
  await expect(page.getByRole('heading',{name:'Sign in to your account'})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>/token|session/i.test(k)))).toBe(false);
});

test('F09 idempotency replays once and rejects a changed payload',async({page})=>{
 await signIn(page);const key=crypto.randomUUID(),body={name:'Retry fixture '+crypto.randomUUID(),filters:{city:'bj',currency:'CNY',transaction:'sale'},cadence:'weekly',version:0},headers={Origin:'http://localhost:8088','Idempotency-Key':key};
 const first=await page.request.post('/api/v1/me/saved-searches',{headers,data:body});expect(first.ok()).toBe(true);const saved=(await first.json()).data;
 const reordered={version:body.version,cadence:body.cadence,filters:body.filters,name:body.name};const replay=await page.request.post('/api/v1/me/saved-searches',{headers,data:reordered});expect(replay.ok()).toBe(true);expect((await replay.json()).data.id).toBe(saved.id);
 const conflict=await page.request.post('/api/v1/me/saved-searches',{headers,data:{...body,name:'Changed payload'}});expect(conflict.status()).toBe(409);expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
 const searches=(await (await page.request.get('/api/v1/me/saved-searches')).json()).data;expect(searches.filter((row:any)=>row.id===saved.id)).toHaveLength(1);
 expect((await page.request.delete('/api/v1/me/saved-searches/'+saved.id,{headers:{Origin:'http://localhost:8088','Idempotency-Key':crypto.randomUUID()},data:{version:saved.version}})).ok()).toBe(true);
});
