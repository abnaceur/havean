# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: digitization-model-publication.spec.ts >> reviewed structural and splat models use separate listing approval, public rendering and withdrawal
- Location: tests/e2e/digitization-model-publication.spec.ts:5:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-model-publication-review-id="95e979bf-bf5b-4cd2-9de0-032220b0928e"]')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('[data-model-publication-review-id="95e979bf-bf5b-4cd2-9de0-032220b0928e"]') with timeout 15000ms
  - waiting for locator('[data-model-publication-review-id="95e979bf-bf5b-4cd2-9de0-032220b0928e"]')

```

```yaml
- alert
- complementary:
  - link "Haven home":
    - /url: /ops
    - text: haven
  - text: PROFESSIONAL WORKSPACE
  - navigation "Workspace navigation":
    - link "Provider reviews":
      - /url: /ops/provider-reviews
    - link "My invitations":
      - /url: /ops/invitations
    - link "Credential reviews":
      - /url: /ops/credential-reviews
    - link "Owner requests":
      - /url: /ops/owner-requests
    - link "Overview":
      - /url: /ops
    - link "Property listings":
      - /url: /ops/listings
    - link "Verification queue":
      - /url: /ops/reviews
  - link "Consumer marketplace":
    - /url: http://localhost:8088/bj
  - paragraph: Synthetic Beijing environment CNY · m² · Asia/Shanghai
- banner:
  - text: HAVEN / REVIEWS
  - button "Switch to dark theme"
  - text: M Moderator Demo
  - button "Sign out"
- main:
  - text: YOUR PROPERTY WORKSPACE
  - heading "Verification queue" [level=1]
  - paragraph: Manage records within your assigned permissions.
  - text: moderator
  - region "Assigned private model reviews":
    - heading "Private model reviews" [level=2]
    - paragraph: Inspect the exact candidate for privacy and visualization limitations. Structural scale is estimated; reconstructed scenes are unscaled. Measurements are unavailable.
    - paragraph: No current model reviews are assigned to you.
  - region "Assigned model publication reviews":
    - heading "Model publication reviews" [level=2]
    - paragraph: No current model publication revisions are assigned to you.
  - region "Assigned private registration reviews":
    - heading "Private camera registration reviews" [level=2]
    - paragraph: Verify the observed transform and selected camera positions. Approval enables only private viewpoints; measurements and publication require separate approval.
    - article:
      - heading "Camera registration review 3d8b1e65-d56a-4ceb-bfbf-59962714a773" [level=3]
      - region "Private reconstructed scene preview":
        - paragraph: Reconstruction is a visual approximation. Metric measurements, room coverage and floor navigation require independent review. This preview has no verified headset support.
        - button "Open scene preview"
      - button "Open shared floor plan"
      - table "Observed scene and plan correspondences":
        - caption: Observed scene and plan correspondences
        - rowgroup:
          - row "Scene X, Y, Z Plan X, Y, Z":
            - columnheader "Scene X, Y, Z"
            - columnheader "Plan X, Y, Z"
        - rowgroup:
          - row "0, 0, 0 0, 0, 0":
            - cell "0, 0, 0"
            - cell "0, 0, 0"
          - row "1, 0, 0 2, 0, 0":
            - cell "1, 0, 0"
            - cell "2, 0, 0"
          - row "0, 1, 0 0, 2, 0":
            - cell "0, 1, 0"
            - cell "0, 2, 0"
      - group "Independent viewpoint decision":
        - text: Independent viewpoint decision
        - checkbox "Approve camera Observed room viewpoint · scene 1, 1, 0.75 · plan 2, 2, 1.5 · room room"
        - text: Approve camera Observed room viewpoint · scene 1, 1, 0.75 · plan 2, 2, 1.5 · room room
        - checkbox "Approve camera Excluded viewpoint · scene 0.5, 0.5, 0.75 · plan 1, 1, 1.5 · room room"
        - text: Approve camera Excluded viewpoint · scene 0.5, 0.5, 0.75 · plan 1, 1, 1.5 · room room
        - checkbox "I independently verified the observed scene-to-plan transform."
        - text: I independently verified the observed scene-to-plan transform.
        - checkbox "I verified the selected camera positions against the shared scene and floor plan."
        - text: I verified the selected camera positions against the shared scene and floor plan.Registration review reason
        - textbox "Registration review reason"
        - button "Approve selected camera viewpoints" [disabled]
        - button "Reject registration review" [disabled]
    - article:
      - heading "Camera registration review e2b55deb-ec7d-4cff-8d28-fbbf862ed7b4" [level=3]
      - region "Private reconstructed scene preview":
        - paragraph: Reconstruction is a visual approximation. Metric measurements, room coverage and floor navigation require independent review. This preview has no verified headset support.
        - button "Open scene preview"
      - button "Open shared floor plan"
      - table "Observed scene and plan correspondences":
        - caption: Observed scene and plan correspondences
        - rowgroup:
          - row "Scene X, Y, Z Plan X, Y, Z":
            - columnheader "Scene X, Y, Z"
            - columnheader "Plan X, Y, Z"
        - rowgroup:
          - row "0, 0, 0 0, 0, 0":
            - cell "0, 0, 0"
            - cell "0, 0, 0"
          - row "1, 0, 0 2, 0, 0":
            - cell "1, 0, 0"
            - cell "2, 0, 0"
          - row "0, 1, 0 0, 2, 0":
            - cell "0, 1, 0"
            - cell "0, 2, 0"
      - group "Independent viewpoint decision":
        - text: Independent viewpoint decision
        - checkbox "Approve camera Observed room viewpoint · scene 1, 1, 0.75 · plan 2, 2, 1.5 · room room"
        - text: Approve camera Observed room viewpoint · scene 1, 1, 0.75 · plan 2, 2, 1.5 · room room
        - checkbox "Approve camera Excluded viewpoint · scene 0.5, 0.5, 0.75 · plan 1, 1, 1.5 · room room"
        - text: Approve camera Excluded viewpoint · scene 0.5, 0.5, 0.75 · plan 1, 1, 1.5 · room room
        - checkbox "I independently verified the observed scene-to-plan transform."
        - text: I independently verified the observed scene-to-plan transform.
        - checkbox "I verified the selected camera positions against the shared scene and floor plan."
        - text: I verified the selected camera positions against the shared scene and floor plan.Registration review reason
        - textbox "Registration review reason"
        - button "Approve selected camera viewpoints" [disabled]
        - button "Reject registration review" [disabled]
    - article:
      - heading "Camera registration review 7a0b0e3e-d5bb-4764-ad9b-855c346a8606" [level=3]
      - region "Private reconstructed scene preview":
        - paragraph: Reconstruction is a visual approximation. Metric measurements, room coverage and floor navigation require independent review. This preview has no verified headset support.
        - button "Open scene preview"
      - button "Open shared floor plan"
      - table "Observed scene and plan correspondences":
        - caption: Observed scene and plan correspondences
        - rowgroup:
          - row "Scene X, Y, Z Plan X, Y, Z":
            - columnheader "Scene X, Y, Z"
            - columnheader "Plan X, Y, Z"
        - rowgroup:
          - row "0, 0, 0 0, 0, 0":
            - cell "0, 0, 0"
            - cell "0, 0, 0"
          - row "1, 0, 0 2, 0, 0":
            - cell "1, 0, 0"
            - cell "2, 0, 0"
          - row "0, 1, 0 0, 2, 0":
            - cell "0, 1, 0"
            - cell "0, 2, 0"
      - group "Independent viewpoint decision":
        - text: Independent viewpoint decision
        - checkbox "Approve camera Observed room viewpoint · scene 1, 1, 0.75 · plan 2, 2, 1.5 · room room"
        - text: Approve camera Observed room viewpoint · scene 1, 1, 0.75 · plan 2, 2, 1.5 · room room
        - checkbox "Approve camera Excluded viewpoint · scene 0.5, 0.5, 0.75 · plan 1, 1, 1.5 · room room"
        - text: Approve camera Excluded viewpoint · scene 0.5, 0.5, 0.75 · plan 1, 1, 1.5 · room room
        - checkbox "I independently verified the observed scene-to-plan transform."
        - text: I independently verified the observed scene-to-plan transform.
        - checkbox "I verified the selected camera positions against the shared scene and floor plan."
        - text: I verified the selected camera positions against the shared scene and floor plan.Registration review reason
        - textbox "Registration review reason"
        - button "Approve selected camera viewpoints" [disabled]
        - button "Reject registration review" [disabled]
  - region "Assigned private tour reviews":
    - heading "Private tour reviews" [level=2]
    - paragraph: Review only the captures explicitly shared with you. Confirm genuine projection and privacy before approval; publication and geometry approval remain separate.
    - paragraph: No current pending tour reviews are assigned to you.
  - region "Assigned tour publication reviews":
    - heading "Tour publication reviews" [level=2]
    - paragraph: No current tour publication revisions are assigned to you.
  - heading "Assign owner requests" [level=2]
  - paragraph: Only currently eligible agents are available. Assignments are scoped to your agency or moderation authority.
  - heading "No owner requests waiting" [level=3]
  - paragraph: Submitted requests within your permissions appear here.
  - heading "Development publication reviews" [level=2]
  - paragraph: No projects awaiting review.
  - navigation "Development review pages":
    - button "Previous projects" [disabled]
    - text: Page 1
    - button "Next projects" [disabled]
  - heading "Property media reviews" [level=2]
  - heading "No media awaiting review" [level=3]
  - paragraph: Videos, plans and panorama scenes appear here after submission.
  - heading "Property publication queue" [level=2]
  - heading "No properties awaiting review" [level=3]
  - paragraph: Submitted property drafts appear here for publication review.
  - heading "Owner property submissions" [level=2]
  - heading "No submissions waiting" [level=3]
  - paragraph: Owner requests appear here after submission.
  - heading "Pending listing revisions" [level=2]
  - article:
    - heading "Synthetic reviewed model fixture" [level=3]
    - paragraph: "Proposed title: Synthetic reviewed model fixture"
    - paragraph: "Proposed price: CN¥2,500,000"
    - button "Approve revision"
    - button "Reject revision"
  - navigation "Review queue pages":
    - button "Previous reviews" [disabled]
    - text: Page 1
    - button "Next reviews" [disabled]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {readFileSync} from 'node:fs';
  3  | import AxeBuilder from '@axe-core/playwright';
  4  | import {login} from '../support/browser';
  5  | test('reviewed structural and splat models use separate listing approval, public rendering and withdrawal',async({page,browser},info)=>{
  6  |  test.setTimeout(240000);const origin='http://localhost:8089',web='http://localhost:8088';await login(page,'agent',origin,'/ops');
  7  |  for(const modelType of ['structural','splat'] as const){
  8  |   const f=JSON.parse(readFileSync(`infra/generated/integration/model-publication-${modelType}-${info.project.name}.json`,'utf8'));
  9  |   await page.goto(`${origin}/ops/digitization?workspace=${f.engineId}`);const form=page.getByRole('region',{name:'Reviewed model publication',exact:true});await expect(form).toBeVisible();
  10 |   await form.getByRole('button',{name:'Refresh model publication status',exact:true}).click();await form.getByRole('combobox',{name:'Reviewed model candidate',exact:true}).selectOption(f.reviewId);
  11 |   await expect(form.getByRole('button',{name:'Propose reviewed model publication',exact:true})).toBeDisabled();
  12 |   await form.getByRole('textbox',{name:'Model publication reason',exact:true}).fill('Synthetic reviewed model publication journey; no real property or human acceptance claim.');
  13 |   await form.getByRole('checkbox',{name:'I authorize publication of this independently reviewed model visualization.',exact:true}).check();
  14 |   const pending=page.waitForResponse(response=>response.url().endsWith('/model-publication-proposals')&&response.request().method()==='POST');await form.getByRole('button',{name:'Propose reviewed model publication',exact:true}).click();const response=await pending;expect(response.status()).toBe(201);const proposal=(await response.json()).data;
  15 |   const staffContext=await browser.newContext({viewport:info.project.use.viewport}),staff=await staffContext.newPage();try{
> 16 |    await login(staff,'moderator',origin,'/ops');await staff.goto(origin+'/ops/reviews');const article=staff.locator(`[data-model-publication-review-id="${proposal.revisionId}"]`);await expect(article).toBeVisible();
     |                                                                                                                                                                                                          ^ Error: expect(locator).toBeVisible() failed
  17 |    await expect(article.getByRole('button',{name:'Approve model publication revision',exact:true})).toBeDisabled();
  18 |    await article.getByRole('button',{name:'Inspect publication model',exact:true}).click();await article.getByRole('button',{name:modelType==='structural'?'Open 3D preview':'Open scene preview',exact:true}).click();await expect(article.getByRole('status')).toContainText(modelType==='structural'?'Structural model loaded':'Scene loaded:',{timeout:30000});
  19 |    await article.getByRole('checkbox',{name:'I independently verified this exact reviewed model, privacy treatment, visualization limitations and current listing authority.',exact:true}).check();
  20 |    await article.getByRole('textbox',{name:'Model publication review reason',exact:true}).fill('Independent synthetic CI listing/model review; no human parity or measured-property approval.');
  21 |    const axe=await new AxeBuilder({page:staff}).include(`[data-model-publication-review-id="${proposal.revisionId}"]`).analyze();expect(axe.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
  22 |    await article.getByRole('button',{name:'Approve model publication revision',exact:true}).click();await expect(article).toHaveCount(0);
  23 |   }finally{await staffContext.close();}
  24 |   const consumerContext=await browser.newContext({viewport:info.project.use.viewport}),consumer=await consumerContext.newPage();try{
  25 |    const manifestResponse=await consumer.request.get(`${web}/api/v1/listings/${f.listingId}/digitization-model`);expect(manifestResponse.status()).toBe(200);const model=(await manifestResponse.json()).data;expect(model).toMatchObject({viewerType:modelType,metricMeasurementsAvailable:false,scaleStatus:modelType==='structural'?'estimated':'unscaled'});for(const privateValue of [f.engineId,f.artifactId,f.sourceAssetId,f.geometryRevisionId])expect(JSON.stringify(model)).not.toContain(privateValue);
  26 |    const detail=(await (await consumer.request.get(`${web}/api/v1/listings/${f.listingId}`)).json()).data;await consumer.goto(`${web}/${detail.city}/buy/${detail.slug}`);
  27 |    await consumer.getByRole('button',{name:modelType==='structural'?'Explore reviewed structural model':'Explore reviewed reconstructed scene',exact:true}).click();const dialog=consumer.getByRole('dialog',{name:'Reviewed property model',exact:true});
  28 |    await dialog.getByRole('button',{name:modelType==='structural'?'Open 3D preview':'Open scene preview',exact:true}).click();await expect(dialog.getByRole('status')).toContainText(modelType==='structural'?'Structural model loaded':'Scene loaded:',{timeout:30000});
  29 |    await expect(dialog.getByRole('button',{name:'Measure scene performance',exact:true})).toHaveCount(0);await expect(dialog.getByText('Metric measurements are unavailable.',{exact:false})).toBeVisible();
  30 |    for(const width of [320,390,768,1440]){await consumer.setViewportSize({width,height:900});expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);}
  31 |    await dialog.screenshot({path:`evidence/digitization/published-model-${modelType}-${info.project.name}.png`});await consumer.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  32 |    await form.getByRole('button',{name:'Refresh model publication status',exact:true}).click();await expect(form.getByRole('button',{name:'Withdraw published property model',exact:true})).toBeVisible();await form.getByRole('textbox',{name:'Model publication reason',exact:true}).fill('Withdraw the synthetic reviewed property model.');await form.getByRole('button',{name:'Withdraw published property model',exact:true}).click();await expect(form.getByRole('status')).toContainText('withdrawn from public requests');
  33 |    expect((await (await consumer.request.get(`${web}/api/v1/listings/${f.listingId}/digitization-model`)).json()).data).toBeNull();expect((await consumer.request.get(web+model.contentUrl)).status()).toBe(404);
  34 |   }finally{await consumerContext.close();}
  35 |  }
  36 | });
  37 | 
```