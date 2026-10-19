# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: digitization-operator-processing.spec.ts >> operator uploads arbitrary-layout PDF and actual queue/CPU processing produces private source-linked review facts
- Location: tests/e2e/digitization-operator-processing.spec.ts:9:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: 'Private source processing' }).getByText(/Run 1 · revision 1 · awaiting_review/)
Expected: visible
Timeout: 240000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('region', { name: 'Private source processing' }).getByText(/Run 1 · revision 1 · awaiting_review/) with timeout 240000ms
  - waiting for getByRole('region', { name: 'Private source processing' }).getByText(/Run 1 · revision 1 · awaiting_review/)

```

```yaml
- alert
- complementary:
  - link "Haven home":
    - /url: /ops
    - text: haven
  - text: PROFESSIONAL WORKSPACE
  - navigation "Workspace navigation":
    - link "Viewing availability":
      - /url: /ops/availability
    - link "My invitations":
      - /url: /ops/invitations
    - link "My credentials":
      - /url: /ops/credentials
    - link "Overview":
      - /url: /ops
    - link "Property listings":
      - /url: /ops/listings
    - link "Leads & inquiries":
      - /url: /ops/leads
    - link "Viewing calendar":
      - /url: /ops/viewings
    - link "Conversations":
      - /url: /ops/messages
  - link "Consumer marketplace":
    - /url: http://localhost:8088/bj
  - paragraph: Synthetic Beijing environment CNY · m² · Asia/Shanghai
- banner:
  - text: HAVEN / DIGITIZATION
  - button "Switch to dark theme"
  - text: A Agent Demo
  - button "Sign out"
- main:
  - text: YOUR PROPERTY WORKSPACE
  - heading "Digitization plan" [level=1]
  - paragraph: Manage records within your assigned permissions.
  - text: agent · consumer
  - heading "Owner source permissions" [level=2]
  - paragraph: The source owner can grant separate private model review and public model proposal permissions. Share this link with the current owner.
  - link "Owner model source permission page":
    - /url: http://localhost:8088/account/properties?modelSource=9e481ba0-7b34-4d38-81e1-2959349944fc
  - region "Reviewed model publication":
    - heading "Model publication" [level=2]
    - button "Refresh model publication status"
    - paragraph: Link this workspace to a published listing before proposing model publication.
    - status
  - region "Private reconstructed property":
    - heading "Reconstructed property" [level=2]
    - button "Reload reconstructed scenes"
    - paragraph: Scenes remain private pending independent privacy and render review. Unavailable rooms and measurements are not inferred.
    - paragraph: No reconstructed scene is available for this source revision.
  - region "Private property quality summary":
    - heading "Property quality summary" [level=2]
    - button "Reload quality summary"
    - paragraph: Add a property source before viewing its quality.
    - paragraph: Document areas and room net areas describe different things. Comparisons do not confirm official equivalence.
  - region "Private source processing":
    - heading "Add and process property sources" [level=2]
    - paragraph: Use any document layout. Extracted details require review; unavailable information stays blank.
    - text: Source purpose
    - combobox "Source purpose":
      - option "Property document" [selected]
      - option "Floor plan"
      - option "Genuine panorama"
    - text: Choose property source
    - button "Choose property source"
    - text: Source rights and origin
    - textbox "Source rights and origin": Self-authored CI document; no representative accuracy claim.
    - checkbox "I am authorized to upload and process this property source." [checked]
    - text: I am authorized to upload and process this property source.
    - button "Upload private source" [disabled]
    - text: Document language
    - combobox "Document language":
      - option "English" [selected]
      - option "French"
      - option "Arabic"
    - status: Processing queued. When it finishes, reload the private results for review.
    - button "Reload processing status"
    - list:
      - listitem:
        - text: 1. document · application/pdf · 652 bytes
        - button "Extract available facts"
        - button "Prepare source pages"
    - paragraph: "Observed completed attempts: 0."
    - heading "Private processing runs" [level=3]
    - list:
      - listitem:
        - text: Run 1 · revision 1 · queued
        - list:
          - listitem: Document facts · queued
  - region "Private document fact review":
    - heading "Document facts" [level=2]
    - paragraph: Review the original quote and source crop. Missing fields remain unknown. These decisions stay private and require a separate inventory review.
    - paragraph: Add a property source to view document facts.
    - status
    - button "Reload document facts"
  - region "Room capture checklist":
    - heading "Room capture checklist" [level=2]
    - paragraph: Save rooms, the current room and your clip uploads to continue later. Uploaded clips remain private and require validation before processing.
    - button "Start room capture"
    - region "Validate uploaded room clips":
      - heading "Validate uploaded room clips" [level=3]
      - paragraph: Choose a completed clip up to 10 MiB. Scanning keeps the original private; codec validation and frame extraction are separate processing actions.
      - text: Completed capture clip
      - combobox "Completed capture clip":
        - option "Choose completed clip" [selected]
      - button "Scan private clip" [disabled]
      - button "Reload clip source status" [disabled]
      - button "Add scanned clip to property sources" [disabled]
      - status
  - region "Training frame privacy":
    - heading "Training frame privacy" [level=2]
    - paragraph: Inspect selected frames and exclude whole frames or supply black mask rectangles in original upright pixels. Automatic sensitive-region detection is unavailable. Privacy review, coverage, poses and scale remain unverified.
    - button "Reload private frame scope"
    - paragraph: No selected frame dataset is available yet.
  - region "Private panorama capture review":
    - heading "Private panorama captures" [level=2]
    - paragraph: Preview captures and record their room links. These candidates remain unconfirmed and require source review.
    - heading "No processed panorama captures" [level=3]
    - paragraph: Add an authorized 360 capture to preview its private image tiers.
    - status
  - region "Private plan editor":
    - heading "Plan trace" [level=2]
    - paragraph: Private, unscaled drawing · heights unknown · new draft
    - status
    - button "Reload saved trace"
    - heading "No rendered plan pages" [level=3]
    - paragraph: Add an authorized scanned plan to this private draft before tracing.
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {readFileSync} from 'node:fs';
  3  | import {login} from '../support/browser';
  4  | function pdf(){
  5  |  const stream='BT /F1 12 Tf 20 160 Td (Unit number: 00123) Tj 0 -20 Td (City: Dubai; Plot number: 00123; 2 bedrooms) Tj ET';
  6  |  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  7  |  let text='%PDF-1.4\n';const offsets:number[]=[];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(text));text+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(text);
  8  | }
  9  | test('operator uploads arbitrary-layout PDF and actual queue/CPU processing produces private source-linked review facts',async({page},info)=>{
  10 |  if(process.env.HAVEN_RECOVERY_REHEARSAL==='true')test.setTimeout(420000);
  11 |  const {engineId}=JSON.parse(readFileSync(`infra/generated/integration/operator-processing-${info.project.name}.json`,'utf8')),origin='http://localhost:8089';
  12 |  await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+engineId);
  13 |  const panel=page.getByRole('region',{name:'Private source processing'});
  14 |  await panel.getByLabel('Choose property source',{exact:true}).setInputFiles({name:'arbitrary-property-information.pdf',mimeType:'application/pdf',buffer:pdf()});
  15 |  await panel.getByLabel('Source rights and origin',{exact:true}).fill('Self-authored CI document; no representative accuracy claim.');await panel.getByRole('checkbox',{name:'I am authorized to upload and process this property source.'}).check();
  16 |  await panel.getByRole('button',{name:'Upload private source',exact:true}).click();await expect(panel.getByRole('status')).toHaveText('Source saved privately. Select a processing action below.');
  17 |  await panel.getByRole('button',{name:'Extract available facts',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Processing queued.');
> 18 |  await expect(panel.getByText(/Run 1 · revision 1 · awaiting_review/)).toBeVisible({timeout:process.env.HAVEN_RECOVERY_REHEARSAL==='true'?240000:45000});
     |                                                                        ^ Error: expect(locator).toBeVisible() failed
  19 |  const summary=page.getByRole('region',{name:'Private property quality summary'});await summary.getByRole('button',{name:'Reload quality summary',exact:true}).click();await expect(summary.getByText('4 source facts · 4 awaiting review · 0 pages still requiring text review')).toBeVisible();
  20 |  const review=page.getByRole('region',{name:'Private document fact review'});await review.getByRole('button',{name:'Reload document facts',exact:true}).click();
  21 |  const response=await page.request.get(origin+'/api/v1/ops/digitizations/'+engineId+'/facts');expect(response.status()).toBe(200);const facts=(await response.json()).data.candidates;
  22 |  expect(facts.map((f:any)=>f.field).sort()).toEqual(['bedrooms','city','plotId','unitId']);expect(facts.every((f:any)=>f.review.status==='pending')).toBe(true);
  23 |  const city=facts.find((f:any)=>f.field==='city');expect(city.normalizedValue).toBe('Dubai');expect(facts.find((f:any)=>f.field==='plotId').normalizedValue).toBe('00123');
  24 |  await review.getByLabel('Source fact',{exact:true}).selectOption(city.id);await expect(review.getByRole('blockquote')).toContainText('City: Dubai');await expect(review.getByRole('img',{name:'Source crop for city, page 1'})).toBeVisible();
  25 |  const leaked=JSON.stringify((await (await page.request.get(origin+'/api/v1/ops/digitizations/'+engineId+'/sources')).json()));expect(leaked).not.toMatch(/object_key|quarantine|sourceSha256/);
  26 | });
  27 | 
```