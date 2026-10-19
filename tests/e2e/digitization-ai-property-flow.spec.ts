import {test,expect} from '@playwright/test';
import {existsSync,readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {login} from '../support/browser';

/** Retained synthetic experiment. Native processing is real; source geometry is unverified. */
test('reference-constrained AI property sources exercise the actual agent digitization flow',async({page})=>{
 test.skip(process.env.TEST_AI_PROPERTY_FLOW!=='true','Opt-in retained synthetic source experiment.');
 test.setTimeout(3600000);page.setDefaultTimeout(60000);
 const origin='http://localhost:8089',assets='assets/digitization-ai-workflow-v1',evidence='evidence/digitization/ai-property-flow',checkpoint='infra/generated/ai-property-flow.json';
 mkdirSync(evidence,{recursive:true});mkdirSync('infra/generated',{recursive:true});
 const state:any=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint,'utf8')):{synthetic:true,checks:{},uploaded:[]};delete state.lastError;
 const save=()=>writeFileSync(checkpoint,JSON.stringify(state,null,2)+'\n');
 const record=()=>writeFileSync(evidence+'/result.json',JSON.stringify({O:'User authorized AI-generated reference-constrained property images for the agent workflow.',R:'Normal agent upload, plan/document processing, private panorama, capture selection and actual COLMAP/gsplat.',P:state,V:{realPropertyValidation:false,fullApartmentReconstructionAccepted:false,publiclyPublished:false,manualGeometryUsed:false}},null,2)+'\n');
 try{
  if(!existsSync(assets+'/floor-plan.png')){
   await page.setViewportSize({width:1600,height:1200});await page.setContent(readFileSync(assets+'/floor-plan.svg','utf8'));
   await page.locator('svg').screenshot({path:assets+'/floor-plan.png'});
  }
  if(!existsSync(assets+'/property-summary.pdf')){
   await page.setContent('<main style="font:22px sans-serif;padding:50px"><h1>SYNTHETIC PROPERTY TEST DOCUMENT</h1><p>Fictional furnished apartment. Not a real property or offer.</p><p>Bedrooms: 2</p><p>Bathrooms: 1</p><p>Living rooms: 1</p><p>Kitchen: 1</p><p>Area, address, price, dimensions and legal ownership: unknown.</p><p>AI-generated imagery is illustrative. The schematic plan is unmeasured. Source consistency and room completeness require review.</p></main>');
   await page.pdf({path:assets+'/property-summary.pdf',format:'A4'});
  }
  await page.setViewportSize({width:1440,height:900});await login(page,'agent',origin,'/ops');
  if(!state.workspaceId){
   await page.goto(origin+'/ops/digitization');await page.getByRole('button',{name:'Create private draft',exact:true}).click();
   await expect(page).toHaveURL(/workspace=[0-9a-f-]+/);state.workspaceId=new URL(page.url()).searchParams.get('workspace');save();
  }
  const base=origin+'/api/v1/ops/digitizations/'+state.workspaceId,url=origin+'/ops/digitization?workspace='+state.workspaceId;
  state.url=url;state.reconstructionUrl=url+'&view=construction';save();
  async function read(path:string){const response=await page.request.get(base+path,{timeout:240000});expect(response.ok(),path+': '+await response.text()).toBe(true);return (await response.json()).data;}
  await page.goto(url);
  const upload=page.getByRole('region',{name:'Private source processing',exact:true});
  const manifest=JSON.parse(readFileSync(assets+'/manifest.json','utf8'));
  const photos=manifest.images.filter((item:any)=>item.purpose==='photo');
  for(const group of [{purpose:'photo',files:photos.map((item:any)=>item.file)},{purpose:'plan',files:['floor-plan.png']},{purpose:'document',files:['property-summary.pdf']},{purpose:'panorama',files:['living-panorama.png']}]){
   const sources=await read('/sources');
   const remaining=group.files.filter((file:string)=>!sources.some((s:any)=>s.purpose===group.purpose&&s.bytes===String(statSync(assets+'/'+file).size)));
   if(!remaining.length)continue;
   await upload.getByRole('combobox',{name:'Source purpose',exact:true}).selectOption(group.purpose);
   await upload.getByLabel('Choose property source',{exact:true}).setInputFiles(remaining.map((file:string)=>assets+'/'+file));
   await upload.getByLabel('Source rights and origin',{exact:true}).fill('Authorized original AI-generated synthetic property experiment. Reference-constrained images; geometry unverified. Schematic plan is not surveyed. Panorama is synthetic, not genuine camera capture.');
   await upload.getByRole('checkbox',{name:'I am authorized to upload and process this property source.',exact:true}).check();
   await upload.getByRole('button',{name:'Upload private source',exact:true}).click();
   await expect(upload.getByText('Source saved privately. Select a processing action below.',{exact:true})).toBeVisible({timeout:300000});
   state.uploaded.push(...remaining);save();console.log('Uploaded '+group.purpose+': '+remaining.length);
  }
  const sources=await read('/sources');expect(sources).toHaveLength(photos.length+3);
  state.checks.agentUpload=true;state.inputRevision=(await read('')).inputRevision;save();record();
  // All source bindings precede processing so a later upload cannot invalidate results.
  for(const item of [{key:'plan',button:'Prepare source pages',path:'/plan-pages'},{key:'document',button:'Extract available facts',path:'/facts'},{key:'panorama',button:'Prepare panorama',path:'/panorama-candidates'}]){
   if(state.checks[item.key])continue;
   const row=upload.locator('li').filter({hasText:new RegExp('^\\d+\\. '+(item.key==='document'?'document':item.key)+' ·')});
   const responsePromise=page.waitForResponse(r=>r.url()===base+'/process'&&r.request().method()==='POST');
   await row.getByRole('button',{name:item.button,exact:true}).click();const response=await responsePromise;expect(response.ok(),await response.text()).toBe(true);
   const run=(await response.json()).data;
   await expect.poll(async()=>{const current=(await read('/runs')).find((r:any)=>r.id===run.id);if(['failed','cancelled'].includes(current?.state))throw Error(JSON.stringify(current));return current?.stages.every((stage:any)=>stage.state==='succeeded');},{timeout:300000,intervals:[2000,5000]}).toBe(true);
   const result=await read(item.path);writeFileSync(evidence+'/'+item.key+'.json',JSON.stringify(result,null,2));
   if(item.key!=='document')expect(result.length).toBeGreaterThan(0);
   else expect(result.candidates.length).toBeGreaterThan(0);
   state.checks[item.key]=true;save();record();console.log('Processed '+item.key);
  }
  await page.reload();
  const review=page.getByRole('region',{name:'Private panorama capture review',exact:true});
  await review.getByRole('button',{name:'Review private captures',exact:true}).click();
  const panorama=review.locator('[data-panorama-ready]');await expect(panorama).toHaveAttribute('data-panorama-ready','true');
  await panorama.focus();await panorama.press('ArrowRight');await expect(review.getByText(/View 10°/)).toBeVisible();
  await review.getByLabel('Capture name',{exact:true}).fill('AI-generated living room — synthetic test');
  await review.getByRole('button',{name:'Save private tour',exact:true}).click();await expect(review.getByRole('status').filter({hasText:'Private tour saved.'})).toBeVisible();
  const tour=await read('/tour-revisions/latest');expect(tour.genuinePanoramaConfirmed).toBe(false);expect(tour.graph.nodes[0].captureDeclaration).toBeNull();
  await review.screenshot({path:evidence+'/panorama.png'});state.checks.privatePanoramaInteraction=true;save();record();
  const facts=page.getByRole('region',{name:'Private document fact review',exact:true});await facts.getByRole('button',{name:'Reload document facts',exact:true}).click();
  await expect(facts.getByRole('combobox',{name:'Source fact',exact:true})).toBeVisible();await facts.screenshot({path:evidence+'/facts.png'});
  const pages=await read('/plan-pages');const planPage=await page.request.get(base+'/artifacts/'+pages[0].artifactId+'/preview');expect(planPage.ok()).toBe(true);writeFileSync(evidence+'/uploaded-plan-preview.png',await planPage.body());
  await page.goto(state.reconstructionUrl);
  let candidates=await read('/frame-candidates');
  if(candidates.frames.length!==photos.length){
   const details=page.locator('details').filter({has:page.getByText('1 · Upload photographs and room videos',{exact:true})});if(!await details.evaluate(el=>el.hasAttribute('open')))await details.locator('summary').click();
   const captureUpload=page.getByRole('region',{name:'Private source processing',exact:true});
   await captureUpload.getByRole('button',{name:'Reload processing status',exact:true}).click();
   await expect(captureUpload.getByRole('button',{name:'Prepare photo view',exact:true})).toHaveCount(photos.length);
   await captureUpload.getByRole('button',{name:'Prepare all photo and video views',exact:true}).click();
   await expect.poll(async()=>{candidates=await read('/frame-candidates');return candidates.frames.length;},{timeout:600000,intervals:[3000,5000]}).toBe(photos.length);
  }
  expect(candidates.frames.every((f:any)=>f.kind==='photo_frame')).toBe(true);state.checks.preparedPhotos=candidates.frames.length;save();record();
  let status=await read('/reconstruction-status');
  if(!status.camera||process.env.RETRY_AI_CAMERA==='true'||process.env.RESELECT_AI_PROPERTY==='true'){
   await page.getByText('2 · Select and inspect capture views',{exact:true}).click();
   const selection=page.getByRole('region',{name:'Reconstruction capture selection',exact:true});
   await selection.getByRole('button',{name:'Load prepared capture views',exact:true}).click();
   await expect(selection.getByText(new RegExp('^'+photos.length+' prepared views ·'))).toBeVisible();
   for(const photo of photos){const source=sources.find((s:any)=>s.purpose==='photo'&&s.bytes===String(photo.bytes));expect(source).toBeTruthy();await selection.getByRole('textbox',{name:'Room label for source '+source.assetId,exact:true}).fill(photo.room);}
   if(process.env.RESELECT_AI_PROPERTY==='true'){
    const reviewed=JSON.parse(readFileSync(evidence+'/review-selection.json','utf8'));
    for(const id of reviewed.excludedSourceIds)await selection.getByRole('checkbox',{name:'Include source '+id,exact:true}).uncheck();
    await expect(selection.getByText('16 prepared views · 14 selected',{exact:true})).toBeVisible();
    state.reviewedSelection=reviewed;
   }
   const analyzed=page.waitForResponse(r=>r.url()===base+'/frame-datasets'&&r.request().method()==='POST',{timeout:240000});
   await selection.getByRole('button',{name:'Analyze selected capture views',exact:true}).click();const response=await analyzed;expect(response.ok(),await response.text()).toBe(true);
   const dataset=(await response.json()).data;state.dataset=dataset;save();record();await selection.screenshot({path:evidence+'/capture-selection.png'});
   await expect(selection.getByText(/usable views selected/)).toBeVisible();
   const privacy=page.getByRole('region',{name:'Training frame privacy',exact:true});
   await privacy.getByRole('checkbox',{name:'I inspected the selected frames and supplied their exclusions and masks',exact:true}).check();
   const queued=page.waitForResponse(r=>r.url()===base+'/camera-processing'&&r.request().method()==='POST',{timeout:240000});
   await privacy.getByRole('button',{name:'Reconstruct cameras from masked frames',exact:true}).click();const response2=await queued;expect(response2.ok(),await response2.text()).toBe(true);
   state.checks.cameraQueued=true;save();record();console.log('Actual COLMAP camera job queued.');
  }
  await expect.poll(async()=>{status=await read('/reconstruction-status');return ['failed','cancelled'].includes(status.camera?.state)||status.camera?.stageState==='succeeded';},{timeout:1800000,intervals:[3000,5000]}).toBe(true);
  state.camera=status.camera;save();record();await page.reload();
  const reconstruction=page.getByLabel('Property reconstruction status',{exact:true});await reconstruction.screenshot({path:evidence+'/camera-result.png'});
  if(process.env.EXPECT_AI_CALIBRATION_REJECTION==='true'){
   expect(status.camera?.stageState).toBe('succeeded');
   expect(status.camera?.report?.nextAction).toContain('unstable camera calibration');
   expect(status.camera?.report?.trainingArchiveAvailable).toBe(false);
   await expect(reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true})).toBeDisabled();
   state.checks.invalidCalibrationExplainedAndTrainingBlocked=true;save();record();return;
  }
  expect(status.camera?.report?.trainingArchiveAvailable,'AI multiview images must actually reconstruct; an unsuitable-input result is not end-to-end success.').toBe(true);
  if(status.sceneTraining.job?.exportState!=='succeeded'){
   if(!['draft','queued','running'].includes(status.sceneTraining.job?.state)){
    await expect(reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true})).toBeEnabled();
    const queued=page.waitForResponse(r=>r.url()===base+'/scene-training'&&r.request().method()==='POST',{timeout:240000});
    await reconstruction.getByRole('button',{name:'Reconstruct captured property',exact:true}).click();const response=await queued;expect(response.ok(),await response.text()).toBe(true);
   }
   await expect.poll(async()=>{status=await read('/reconstruction-status');state.scene=status.sceneTraining.job;save();record();if(status.sceneTraining.job?.state==='failed')throw Error(JSON.stringify(status.sceneTraining.job));return status.sceneTraining.job?.exportState;},{timeout:1800000,intervals:[3000,5000]}).toBe('succeeded');
  }
  await page.goto(url+'&view=scene');
  const canvas=page.locator('canvas[aria-label="Private reconstructed scene"]');await expect(canvas).toBeVisible({timeout:240000});
  await expect(page.getByRole('button',{name:'Measure scene performance',exact:true})).toBeEnabled({timeout:60000});
  const initial=await canvas.screenshot({path:evidence+'/reconstructed-scene.png'});await canvas.focus();await canvas.press('ArrowRight');expect((await canvas.screenshot()).equals(initial)).toBe(false);
  state.checks.gpuExportAndInteractiveScene=true;state.sceneUrl=url+'&view=scene';state.sceneTiers=await read('/scene-tiers');
  expect(await read('/geometry')).toBeNull();save();record();
  console.log(JSON.stringify({workspaceId:state.workspaceId,checks:state.checks,camera:state.camera,sceneUrl:state.sceneUrl,synthetic:true,fullApartmentAccepted:false}));
 }catch(error){state.lastError=error instanceof Error?error.message:String(error);save();record();throw error;}
});

test('agent reviews synthetic document facts and the inventory form fills only confirmed values',async({page})=>{
 test.skip(process.env.TEST_AI_PROPERTY_FLOW!=='true','Uses the retained synthetic property workspace.');
 test.setTimeout(180000);page.setDefaultTimeout(60000);
 const origin='http://localhost:8089',state=JSON.parse(readFileSync('infra/generated/ai-property-flow.json','utf8')),base=origin+'/api/v1/ops/digitizations/'+state.workspaceId;
 await login(page,'agent',origin,'/ops');await page.goto(state.url+'#digitization-facts');
 const facts=page.getByRole('region',{name:'Private document fact review',exact:true});
 const response=await page.request.get(base+'/facts');expect(response.ok()).toBe(true);const review=(await response.json()).data;
 expect(review.candidates.some((f:any)=>f.field==='unitArea')).toBe(false);
 for(const [field,value] of Object.entries({bedrooms:2,bathrooms:1,livingRooms:1})){
  const fact=review.candidates.find((f:any)=>f.field===field);expect(fact.normalizedValue).toBe(value);
  await facts.getByRole('combobox',{name:'Source fact',exact:true}).selectOption(fact.id);
  await expect(facts.locator('blockquote')).toContainText(String(value));
  if(fact.review.status!=='accepted'){
   await facts.getByLabel('Fact decision reason',{exact:true}).fill('Checked against the original synthetic test document. Fictional source value only; no real property verification.');
   const saved=page.waitForResponse(r=>r.url()===base+'/facts/'+fact.id+'/decisions'&&r.request().method()==='POST');
   await facts.getByRole('button',{name:'Accept source value',exact:true}).click();const accepted=await saved;expect(accepted.ok(),await accepted.text()).toBe(true);
   await expect(facts.getByRole('button',{name:'Reload document facts',exact:true})).toBeEnabled();
  }
 }
 await facts.getByText('Create an inventory draft from confirmed facts',{exact:true}).click();
 const form=facts.getByRole('form',{name:'Confirmed intake inventory draft',exact:true});
 for(const field of ['bedrooms','bathrooms','livingRooms'])await form.getByRole('checkbox',{name:new RegExp('^'+field+':')}).check();
 await expect(form.getByLabel('Draft beds',{exact:true})).toHaveValue('2');
 await expect(form.getByLabel('Draft baths',{exact:true})).toHaveValue('1');
 await expect(form.getByLabel('Draft livingRooms',{exact:true})).toHaveValue('1');
 await expect(form.getByLabel('Draft area',{exact:true})).toHaveValue('');
 await expect(form.getByLabel('Draft privateAddress',{exact:true})).toHaveValue('');
 await form.screenshot({path:'evidence/digitization/ai-property-flow/confirmed-facts-prefill.png'});
 writeFileSync('evidence/digitization/ai-property-flow/fact-prefill.json',JSON.stringify({synthetic:true,confirmedSourceValues:{beds:2,baths:1,livingRooms:1},unknownFieldsLeftBlank:['area','privateAddress'],inventorySubmitted:false,actualAgentUi:true},null,2)+'\n');
});
