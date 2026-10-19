import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {login} from '../support/browser';
import AxeBuilder from '@axe-core/playwright';
// These six journeys share one gateway IP and reload the complete workspace.
// Keep the fixed 500-read/60-second production limit intact.
test.beforeEach(async()=>{await new Promise(resolve=>setTimeout(resolve,20000));});
test('actual authored export loads through scoped API, resets and disposes WebGL buffers on exit',async({page},info)=>{
 const origin='http://localhost:8089',fixture=JSON.parse(readFileSync(`infra/generated/integration/scene-preview-${info.project.name}.json`,'utf8'));
 await page.addInitScript(()=>{(window as any).__deletedSplatBuffers=0;const original=WebGL2RenderingContext.prototype.deleteBuffer;WebGL2RenderingContext.prototype.deleteBuffer=function(buffer){(window as any).__deletedSplatBuffers++;return original.call(this,buffer);};});
 await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+fixture.engineId);
 const panel=page.getByRole('region',{name:'Private reconstructed property'});
 await expect(panel.getByLabel('Private scene tier')).toBeVisible();await panel.getByRole('button',{name:'Open scene preview',exact:true}).click();
 await expect(panel.getByRole('status')).toContainText(`Scene loaded: ${fixture.splatCount} splats · ${fixture.byteSize} bytes.`,{timeout:30000});
 const canvas=panel.getByLabel('Private reconstructed scene',{exact:true});await expect(canvas).toBeVisible();await canvas.focus();const beforeOrbit=await canvas.screenshot();await canvas.press('ArrowLeft');expect((await canvas.screenshot()).equals(beforeOrbit)).toBe(false);await canvas.press('ArrowUp');await canvas.press('+');await canvas.press('Home');await panel.getByRole('button',{name:'Reset scene view',exact:true}).click();
 await canvas.screenshot({path:`evidence/digitization/authored-splat-viewer-${info.project.name}.png`});
 await panel.getByRole('button',{name:'Measure scene performance',exact:true}).click();
 const measured=panel.getByRole('region',{name:'Measured scene performance'});await expect(measured).toBeVisible({timeout:15000});
 const report=JSON.parse(await measured.getByLabel('Scene performance report').innerText());expect(report.splatCount).toBe(fixture.splatCount);expect(report.downloadBytes).toBe(Number(fixture.byteSize));expect(report.sample.frames).toBeGreaterThan(1);expect(report.sample.framesPerSecond).toBeGreaterThan(0);expect(report.memory.gpuBytes).toBeNull();expect(report.browser).toBe(await page.evaluate(()=>navigator.userAgent));
 const {writeFileSync}=await import('node:fs');writeFileSync(`evidence/digitization/scene-performance-${info.project.name}.json`,JSON.stringify({...report,execution:`Playwright Chromium ${page.context().browser()?.version()} on local Docker host with SwiftShader; mobile is emulation`,fixture:'self-authored 27-splat binary; no reconstruction acceptance'},null,2)+'\n');
 const accessibility=await new AxeBuilder({page}).include('section[aria-label="Private reconstructed property"]').analyze();expect(accessibility.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 const reportRegion=measured.getByRole('region',{name:'Scene performance report'});await reportRegion.focus();await reportRegion.press('ArrowDown');await expect.poll(()=>reportRegion.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
 for(const width of [320,375,390,768,1440]){await page.setViewportSize({width,height:900});expect(await panel.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);}
 const response=await page.request.get(`${origin}/api/v1/ops/digitizations/${fixture.engineId}/scene-tiers`);expect(response.status()).toBe(200);expect(JSON.stringify(await response.json())).not.toMatch(/object_key|quarantine|ownerName|sourceType|checksum/);
 await panel.getByRole('button',{name:'Close scene preview',exact:true}).click();await expect(canvas).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__deletedSplatBuffers)).toBeGreaterThan(0);
 await expect(measured).toHaveCount(0);
 await panel.getByRole('button',{name:'Open scene preview',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Scene loaded:',{timeout:30000});await panel.getByRole('button',{name:'Measure scene performance',exact:true}).click();await canvas.focus();await canvas.press('Escape');await expect(canvas).toHaveCount(0);await expect(measured).toHaveCount(0);await expect(panel.getByRole('button',{name:'Open scene preview',exact:true})).toBeFocused();
});

test('private scene inspection persists pending history and keeps absent room coverage unknown',async({page},info)=>{
 const origin='http://localhost:8089',fixture=JSON.parse(readFileSync(`infra/generated/integration/scene-preview-${info.project.name}.json`,'utf8'));
 await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+fixture.engineId);
 const panel=page.getByRole('region',{name:'Scene privacy and room coverage'});
 await expect(panel.getByText('Room coverage is unknown: no current source-linked plan is available.')).toBeVisible();
 await panel.getByLabel('Scene inspection status').selectOption('issues_found');
 await panel.getByLabel('Scene inspection note').fill('Authored exported scene contains unresolved sensitive details.');
 await panel.getByRole('button',{name:'Record private scene inspection'}).click();
 await expect(panel.getByRole('status')).toContainText('Independent privacy and render approval remains required.');
 await expect(panel.getByText('Latest inspection: issues found. Pending independent review.')).toBeVisible();
 await page.reload();await expect(panel.getByText('Latest inspection: issues found. Pending independent review.')).toBeVisible();
 const response=await page.request.get(`${origin}/api/v1/ops/digitizations/${fixture.engineId}/scene-privacy`);expect(response.status()).toBe(200);const context=(await response.json()).data;
 expect(context.declarations[0]).toMatchObject({privacyReviewRequired:true,reviewStatus:'pending',publiclyServed:false,coverage:[]});
 expect(JSON.stringify(context)).not.toMatch(/artifact_checksum|object_key|organization_id|created_by/);
 const blocked=await page.request.post(`${origin}/api/v1/ops/digitizations/${fixture.engineId}/scene-privacy`,{data:{workspaceVersion:context.workspaceVersion,inputRevision:context.inputRevision,artifactId:fixture.artifactId,geometryRevisionId:null,coverage:[],inspection:'ready_for_independent_review',note:'Cannot grant author approval',reviewStatus:'approved'},headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()}});expect(blocked.status()).toBe(422);
 const accessibility=await new AxeBuilder({page}).include('section[aria-label="Scene privacy and room coverage"]').analyze();expect(accessibility.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
});

test('observed camera registration persists through the session API while unverified navigation stays unavailable',async({page},info)=>{
 test.setTimeout(150000);
 const origin='http://localhost:8089',fixture=JSON.parse(readFileSync(`infra/generated/integration/scene-preview-anchors-${info.project.name}.json`,'utf8'));
 await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+fixture.engineId);
 const panel=page.getByRole('region',{name:'Scene registration and camera anchors'});
 await expect.poll(async()=>{
  const scenes=page.getByRole('region',{name:'Private reconstructed property'});
  if(await scenes.getByRole('alert').filter({hasText:'Too many requests'}).isVisible())await scenes.getByRole('button',{name:'Reload reconstructed scenes',exact:true}).click();
  else if(await panel.getByRole('alert').filter({hasText:'Too many requests'}).isVisible())await panel.getByRole('button',{name:'Reload registration scope',exact:true}).click();
  return panel.getByLabel('Registration floor').isVisible();
 },{timeout:75000,intervals:[5000,10000,15000]}).toBe(true);
 const pairs=[{scene:['0','0','0'],plan:['0','0']},{scene:['1','0','0'],plan:['2','0']},{scene:['0','1','0'],plan:['0','2']}];
 for(const [index,pair] of pairs.entries()){
  const fields=panel.getByRole('group',{name:`Observed correspondence ${index+1}`,exact:true});
  for(const [axis,value] of pair.scene.entries())await fields.getByLabel(`Scene ${['X','Y','Z'][axis]}`,{exact:true}).fill(value);
  for(const [axis,value] of pair.plan.entries())await fields.getByLabel(`Plan ${['X','Y'][axis]}`,{exact:true}).fill(value);
 }
 await panel.getByLabel('Camera label',{exact:true}).fill('Observed room camera');await panel.getByRole('combobox',{name:'Camera room',exact:true}).selectOption('room');
 for(const [axis,value] of ['1','1','0.75'].entries())await panel.getByLabel(`Camera scene ${['X','Y','Z'][axis]}`,{exact:true}).fill(value);
 await panel.getByLabel('Registration observation note').fill('Authored correspondences and viewpoint, pending independent review.');
 await panel.getByRole('button',{name:'Record private registration',exact:true}).click();
 await expect(panel.getByRole('status')).toContainText('Navigation remains unavailable pending independent approval.');
 await page.reload();await expect.poll(async()=>{
  const scenes=page.getByRole('region',{name:'Private reconstructed property'});
  if(await scenes.getByRole('alert').filter({hasText:'Too many requests'}).isVisible())await scenes.getByRole('button',{name:'Reload reconstructed scenes',exact:true}).click();
  else if(await panel.getByRole('alert').filter({hasText:'Too many requests'}).isVisible())await panel.getByRole('button',{name:'Reload registration scope',exact:true}).click();
  return panel.getByRole('list',{name:'Private registration history'}).getByRole('listitem').count();
 },{timeout:75000,intervals:[5000,10000,15000]}).toBe(3);
 const response=await page.request.get(`${origin}/api/v1/ops/digitizations/${fixture.engineId}/scene-registrations`);expect(response.status()).toBe(200);const records=(await response.json()).data;
 expect(records[0]).toMatchObject({reviewStatus:'pending',planNavigationAvailable:false,metricMeasurementsAvailable:false,publiclyServed:false,cameraAnchors:[{label:'Observed room camera',planPosition:[2,2,1.5]}]});
 const w=(await (await page.request.get(`${origin}/api/v1/ops/digitizations/${fixture.engineId}`)).json()).data;
 const denied=await page.request.post(`${origin}/api/v1/ops/digitizations/${fixture.engineId}/scene-registrations`,{headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},data:{version:w.version,inputRevision:w.inputRevision,sceneArtifactId:fixture.artifactId,geometryRevisionId:records[0].geometryRevisionId,floorId:'ground',anchors:records[0].anchors,note:'Author cannot grant navigation approval',planNavigationAvailable:true}});expect(denied.status()).toBe(422);
 const accessibility=await new AxeBuilder({page}).include('section[aria-label="Scene registration and camera anchors"]').analyze();expect(accessibility.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 for(const width of [320,375,390,768,1440]){await page.setViewportSize({width,height:900});expect(await panel.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);}
 await panel.screenshot({path:`evidence/digitization/camera-registration-${info.project.name}.png`});
});
