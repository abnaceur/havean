import '../support/env';
import {test,expect} from '@playwright/test';
import {login} from '../support/browser';
import {completeOtp} from '../support/totp';
import fs from 'node:fs';

test.use({trace:'off'});
const generated=process.env.HAVEN_GENERATED_DIR||'infra/generated';
const password=/Generated local password: `([^`]+)`/.exec(fs.readFileSync(generated+'/personas.md','utf8'))?.[1];
if(!password)throw Error('Generated test-account password required');
const web=process.env.PUBLIC_WEB_URL||'http://localhost:8088',ops=process.env.PUBLIC_OPS_URL||'http://localhost:8089';
const cases=[
 {user:'buyer',origin:web,path:'/account',heading:'Buyer account',role:'consumer'},
 {user:'owner',origin:web,path:'/account',heading:'Owner workspace',role:'owner'},
 {user:'tenant',origin:web,path:'/tenant/leases',heading:'Your tenant portal.',role:'tenant'},
 {user:'agent',origin:ops,path:'/ops',heading:'Agent dashboard',role:'agent'},
 {user:'manager',origin:ops,path:'/ops',heading:'Property management dashboard',role:'property_manager'},
 {user:'developer',origin:ops,path:'/ops/developments',heading:'Developments',role:'developer'},
 {user:'vendor',origin:ops,path:'/ops/providers',heading:'My provider profiles',role:'vendor'},
 {user:'moderator',origin:ops,path:'/ops/reviews',heading:'Verification queue',role:'moderator'},
 {user:'support',origin:ops,path:'/ops/support',heading:'Support cases',role:'support'},
 {user:'admin',origin:ops,path:'/ops/admin',heading:'Administration',role:'admin'},
 {user:'outsider',origin:ops,path:'/ops',heading:'Agent dashboard',role:'agent'}
];
for(const c of cases)test('role landing and navigation: '+c.user,async({page},info)=>{
 await page.goto(c.origin+'/api/v1/auth/login?prompt=login');
 await page.getByRole('textbox',{name:'Username or email'}).fill(c.user);
 await page.getByLabel('Password',{exact:true}).fill(password!);
 await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await completeOtp(page,c.user);
 await expect(page).toHaveURL(c.origin+c.path);
 await expect(page.getByRole('heading',{name:c.heading,exact:true,level:1})).toBeVisible();
 const me=await page.request.get(c.origin+'/api/v1/me');expect(me.ok()).toBe(true);expect((await me.json()).data.roles).toContain(c.role);
 const admin=await page.request.get(c.origin+'/api/v1/ops/users');expect(admin.status()).toBe(c.user==='admin'?200:403);
 if(c.user==='buyer'){
  const nav=page.getByRole('navigation',{name:'Account navigation'});
  await expect(nav.getByRole('link',{name:'Owner statements',exact:true})).toHaveCount(0);
  await expect(nav.getByRole('link',{name:'Property media',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Your tenant portal',exact:true})).toHaveCount(0);
 }
 if(c.user==='owner')await expect(page.getByRole('navigation',{name:'Account navigation'}).getByRole('link',{name:'Owner statements',exact:true})).toBeVisible();
 if(c.origin===ops&&c.user!=='admin')await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Administration',exact:true})).toHaveCount(0);
 if(info.project.name==='mobile')await page.screenshot({path:info.outputPath(c.user+'-role-home.png'),fullPage:true});
});

test('explicit personal deep links are preserved and hidden owner sections remain unavailable',async({page})=>{
 await login(page,'buyer',web,'/account/profile');
 await expect(page.getByRole('heading',{name:'Buyer account',exact:true})).toBeVisible();
 await page.goto(web+'/account/statements');
 await expect(page.getByRole('heading',{name:'This account section is not available for your role',exact:true})).toBeVisible();
 expect((await page.request.get(web+'/api/v1/ops/users')).status()).toBe(403);
});

test('public home sign-in selects the professional workspace and explicit staff pages remain available',async({page})=>{
 await page.goto(web+'/bj');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('textbox',{name:'Username or email'}).fill('developer');await page.getByLabel('Password',{exact:true}).fill(password!);await page.getByRole('button',{name:'Sign In',exact:true}).click();await completeOtp(page,'developer');
 await expect(page).toHaveURL(ops+'/ops/developments');await expect(page.getByRole('heading',{name:'Developments',exact:true})).toBeVisible();
 await page.goto(ops+'/ops/leads');await expect(page.getByRole('heading',{name:'Leads & inquiries',exact:true,level:1})).toBeVisible();
});
