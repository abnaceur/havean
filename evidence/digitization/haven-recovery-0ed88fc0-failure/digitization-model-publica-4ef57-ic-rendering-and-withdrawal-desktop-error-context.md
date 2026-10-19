# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: digitization-model-publication.spec.ts >> reviewed structural and splat models use separate listing approval, public rendering and withdrawal
- Location: tests/e2e/digitization-model-publication.spec.ts:5:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 503
```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - alert [ref=f2e2]
  - generic [ref=f2e3]:
    - complementary [ref=f2e4]:
      - link "Haven home" [ref=f2e5] [cursor=pointer]:
        - /url: /ops
        - text: haven
      - generic [ref=f2e6]: PROFESSIONAL WORKSPACE
      - navigation "Workspace navigation" [ref=f2e7]:
        - link "Viewing availability" [ref=f2e8] [cursor=pointer]:
          - /url: /ops/availability
        - link "My invitations" [ref=f2e11] [cursor=pointer]:
          - /url: /ops/invitations
        - link "My credentials" [ref=f2e17] [cursor=pointer]:
          - /url: /ops/credentials
        - link "Overview" [ref=f2e22] [cursor=pointer]:
          - /url: /ops
        - link "Property listings" [ref=f2e28] [cursor=pointer]:
          - /url: /ops/listings
        - link "Leads & inquiries" [ref=f2e32] [cursor=pointer]:
          - /url: /ops/leads
        - link "Viewing calendar" [ref=f2e37] [cursor=pointer]:
          - /url: /ops/viewings
        - link "Conversations" [ref=f2e40] [cursor=pointer]:
          - /url: /ops/messages
      - generic [ref=f2e43]:
        - link "Consumer marketplace" [ref=f2e44] [cursor=pointer]:
          - /url: http://localhost:8088/bj
        - paragraph [ref=f2e48]: Synthetic Beijing environmentCNY · m² · Asia/Shanghai
    - generic [ref=f2e49]:
      - banner [ref=f2e50]:
        - generic [ref=f2e51]: HAVEN / DIGITIZATION
        - generic [ref=f2e52]:
          - button "Switch to dark theme" [ref=f2e53] [cursor=pointer]
          - generic [ref=f2e56]: A
          - generic [ref=f2e57]: Agent Demo
          - button "Sign out" [ref=f2e58] [cursor=pointer]
      - main [ref=f2e62]:
        - generic [ref=f2e63]:
          - generic [ref=f2e64]:
            - generic [ref=f2e65]: YOUR PROPERTY WORKSPACE
            - heading "Digitization plan" [level=1] [ref=f2e66]
            - paragraph [ref=f2e67]: Manage records within your assigned permissions.
          - generic [ref=f2e68]: agent · consumer
        - generic [ref=f2e69]:
          - heading "Owner source permissions" [level=2] [ref=f2e70]
          - paragraph [ref=f2e71]: The source owner can grant separate private model review and public model proposal permissions. Share this link with the current owner.
          - link "Owner model source permission page" [ref=f2e72] [cursor=pointer]:
            - /url: http://localhost:8088/account/properties?modelSource=fc178f15-21b7-438b-95a6-ed2492c9c974
        - region "Reviewed model publication" [ref=f2e73]:
          - heading "Model publication" [level=2] [ref=f2e74]
          - button "Refresh model publication status" [ref=f2e75] [cursor=pointer]
          - group "Reviewed property model" [ref=f2e76]:
            - paragraph [ref=f2e78]: Only the exact independently reviewed visualization can be proposed. Measurements remain unavailable.
            - generic [ref=f2e79]:
              - text: Reviewed model candidate
              - combobox "Reviewed model candidate" [ref=f2e80]:
                - option "Choose an approved candidate"
                - option "Estimated structural model" [selected]
            - generic [ref=f2e81]:
              - text: Model publication reason
              - textbox "Model publication reason" [ref=f2e82]: Synthetic reviewed model publication journey; no real property or human acceptance claim.
            - generic [ref=f2e83]:
              - checkbox "I authorize publication of this independently reviewed model visualization." [ref=f2e84]
              - text: I authorize publication of this independently reviewed model visualization.
            - button "Propose reviewed model publication" [disabled] [ref=f2e85]
          - status [ref=f2e86]: Model publication proposed. The assigned independent reviewer must approve the listing revision.
        - region "Private reconstructed property" [ref=f2e87]:
          - heading "Reconstructed property" [level=2] [ref=f2e88]
          - button "Reload reconstructed scenes" [ref=f2e89] [cursor=pointer]
          - paragraph [ref=f2e90]: Scenes remain private pending independent privacy and render review. Unavailable rooms and measurements are not inferred.
          - generic [ref=f2e91]:
            - text: Private scene tier
            - combobox "Private scene tier" [ref=f2e92]:
              - option "Scene tier 1 · 27 splats · 864 bytes" [selected]
          - group "Independent splat model review" [ref=f2e93]:
            - generic [ref=f2e95]:
              - text: Assigned model reviewer
              - combobox "Assigned model reviewer" [ref=f2e96]:
                - option "Choose a reviewer" [selected]
                - option "Admin Demo"
                - option "Moderator Demo"
            - generic [ref=f2e97]:
              - checkbox "I have current owner consent to share this private model candidate with the assigned reviewer." [ref=f2e98]
              - text: I have current owner consent to share this private model candidate with the assigned reviewer.
            - button "Request independent model review" [disabled] [ref=f2e99]
          - region "Scene privacy and room coverage" [ref=f2e100]:
            - heading "Scene privacy and room coverage" [level=3] [ref=f2e101]
            - paragraph [ref=f2e102]: Inspect the exported scene for sensitive details. Masking a thumbnail does not remove sensitive splats. Room coverage is an author declaration pending independent review.
            - button "Reload scene inspection scope" [ref=f2e103] [cursor=pointer]
            - paragraph [ref=f2e104]: No scene inspection has been recorded.
            - group "Private scene inspection declaration" [ref=f2e105]:
              - generic [ref=f2e107]:
                - text: Scene inspection status
                - combobox "Scene inspection status" [ref=f2e108]:
                  - option "Not inspected" [selected]
                  - option "Privacy issues found"
                  - option "Ready for independent review"
              - generic [ref=f2e109]:
                - text: Room coverage
                - combobox "Room coverage" [ref=f2e110]:
                  - option "Unknown" [selected]
                  - option "Covered"
                  - option "Partial"
                  - option "Excluded"
              - generic [ref=f2e111]:
                - text: Scene inspection note
                - textbox "Scene inspection note" [ref=f2e112]
              - button "Record private scene inspection" [disabled] [ref=f2e113]
          - region "Scene registration and camera anchors" [ref=f2e114]:
            - heading "Scene registration and camera anchors" [level=3] [ref=f2e115]
            - paragraph [ref=f2e116]: Record observed scene and plan correspondences. Fitting a transform does not approve its scale, camera positions or navigation.
            - button "Reload registration scope" [ref=f2e117] [cursor=pointer]
            - group "Private registration observations" [ref=f2e118]:
              - generic [ref=f2e120]:
                - text: Registration floor
                - combobox "Registration floor" [ref=f2e121]:
                  - option "Ground" [selected]
              - group "Observed correspondence 1" [ref=f2e122]:
                - generic [ref=f2e124]:
                  - text: Scene X
                  - textbox "Scene X" [ref=f2e125]
                - generic [ref=f2e126]:
                  - text: Scene Y
                  - textbox "Scene Y" [ref=f2e127]
                - generic [ref=f2e128]:
                  - text: Scene Z
                  - textbox "Scene Z" [ref=f2e129]
                - generic [ref=f2e130]:
                  - text: Plan X
                  - textbox "Plan X" [ref=f2e131]
                - generic [ref=f2e132]:
                  - text: Plan Y
                  - textbox "Plan Y" [ref=f2e133]
              - group "Observed correspondence 2" [ref=f2e134]:
                - generic [ref=f2e136]:
                  - text: Scene X
                  - textbox "Scene X" [ref=f2e137]
                - generic [ref=f2e138]:
                  - text: Scene Y
                  - textbox "Scene Y" [ref=f2e139]
                - generic [ref=f2e140]:
                  - text: Scene Z
                  - textbox "Scene Z" [ref=f2e141]
                - generic [ref=f2e142]:
                  - text: Plan X
                  - textbox "Plan X" [ref=f2e143]
                - generic [ref=f2e144]:
                  - text: Plan Y
                  - textbox "Plan Y" [ref=f2e145]
              - group "Observed correspondence 3" [ref=f2e146]:
                - generic [ref=f2e148]:
                  - text: Scene X
                  - textbox "Scene X" [ref=f2e149]
                - generic [ref=f2e150]:
                  - text: Scene Y
                  - textbox "Scene Y" [ref=f2e151]
                - generic [ref=f2e152]:
                  - text: Scene Z
                  - textbox "Scene Z" [ref=f2e153]
                - generic [ref=f2e154]:
                  - text: Plan X
                  - textbox "Plan X" [ref=f2e155]
                - generic [ref=f2e156]:
                  - text: Plan Y
                  - textbox "Plan Y" [ref=f2e157]
              - group "Optional observed camera anchor" [ref=f2e158]:
                - generic [ref=f2e160]:
                  - text: Camera label
                  - textbox "Camera label" [ref=f2e161]
                - generic [ref=f2e162]:
                  - text: Camera room
                  - combobox "Camera room" [ref=f2e163]:
                    - option "Select a room" [selected]
                    - option "Room"
                - generic [ref=f2e164]:
                  - text: Camera scene X
                  - textbox "Camera scene X" [ref=f2e165]
                - generic [ref=f2e166]:
                  - text: Camera scene Y
                  - textbox "Camera scene Y" [ref=f2e167]
                - generic [ref=f2e168]:
                  - text: Camera scene Z
                  - textbox "Camera scene Z" [ref=f2e169]
              - generic [ref=f2e170]:
                - text: Registration observation note
                - textbox "Registration observation note" [ref=f2e171]
              - button "Record private registration" [disabled] [ref=f2e172]
            - list "Private registration history" [ref=f2e173]:
              - listitem [ref=f2e174]: Pending registration · 2 camera anchors · navigation unavailable
            - group "Independent camera registration review" [ref=f2e175]:
              - paragraph [ref=f2e177]: Share the current observed transform, camera positions and exact private scene and plan previews with an independent reviewer.
              - generic [ref=f2e178]:
                - text: Assigned registration reviewer
                - combobox "Assigned registration reviewer" [ref=f2e179]:
                  - option "Choose a reviewer" [selected]
                  - option "Admin Demo"
                  - option "Moderator Demo"
              - generic [ref=f2e180]:
                - checkbox "I own the current source assets and share their private scene and plan previews with this reviewer." [ref=f2e181]
                - text: I own the current source assets and share their private scene and plan previews with this reviewer.
              - button "Request independent registration review" [disabled] [ref=f2e182]
          - region "Private scene viewpoints" [ref=f2e183]:
            - paragraph [ref=f2e184]: No current independent camera approval. Record observations and request review to enable private viewpoints.
            - region "Private reconstructed scene preview" [ref=f2e185]:
              - paragraph [ref=f2e186]: Reconstruction is a visual approximation. Metric measurements, room coverage and floor navigation require independent review. This preview has no verified headset support.
              - button "Open scene preview" [ref=f2e187] [cursor=pointer]
        - region "Private property quality summary" [ref=f2e188]:
          - heading "Property quality summary" [level=2] [ref=f2e189]
          - button "Reload quality summary" [ref=f2e190] [cursor=pointer]
          - paragraph [ref=f2e191]: Document areas and room net areas describe different things. Comparisons do not confirm official equivalence.
          - paragraph [ref=f2e192]: 0 source facts · 0 awaiting review · 0 pages still requiring text review
          - paragraph [ref=f2e193]: "Plan scale: estimated. Reconstruction quality: unavailable."
          - list [ref=f2e194]:
            - listitem [ref=f2e195]: "Room net area: 99.00000000 m2 · pending · estimated scale"
        - region "Private source processing" [ref=f2e196]:
          - heading "Add and process property sources" [level=2] [ref=f2e197]
          - paragraph [ref=f2e198]: Use any document layout. Extracted details require review; unavailable information stays blank.
          - generic [ref=f2e199]:
            - text: Source purpose
            - combobox "Source purpose" [ref=f2e200]:
              - option "Property document" [selected]
              - option "Floor plan"
              - option "Genuine panorama"
          - generic [ref=f2e201]:
            - text: Choose property source
            - button "Choose property source" [ref=f2e202]
          - generic [ref=f2e203]:
            - text: Source rights and origin
            - textbox "Source rights and origin" [ref=f2e204]
          - generic [ref=f2e205]:
            - checkbox "I am authorized to upload and process this property source." [ref=f2e206]
            - text: I am authorized to upload and process this property source.
          - button "Upload private source" [disabled] [ref=f2e207]
          - generic [ref=f2e208]:
            - text: Document language
            - combobox "Document language" [ref=f2e209]:
              - option "English" [selected]
              - option "French"
              - option "Arabic"
          - status
          - button "Reload processing status" [ref=f2e210] [cursor=pointer]
          - list [ref=f2e211]:
            - listitem [ref=f2e212]:
              - text: 1. plan · image/png · 54414 bytes
              - button "Prepare source pages" [ref=f2e213] [cursor=pointer]
          - paragraph [ref=f2e214]: "Observed completed attempts: 2. Median observed time: 0.205553 seconds, including startup and transfer."
          - heading "Private processing runs" [level=3] [ref=f2e215]
          - list [ref=f2e216]:
            - listitem [ref=f2e217]:
              - text: Run 1 · revision 1 · awaiting_review
              - list [ref=f2e218]:
                - listitem [ref=f2e219]: Property processing · succeeded
                - listitem [ref=f2e220]: Source pages · succeeded
        - region "Private document fact review" [ref=f2e221]:
          - heading "Document facts" [level=2] [ref=f2e222]
          - paragraph [ref=f2e223]: Review the original quote and source crop. Missing fields remain unknown. These decisions stay private and require a separate inventory review.
          - status
          - button "Reload document facts" [ref=f2e224] [cursor=pointer]
          - paragraph [ref=f2e225]: No source-linked candidates are available.
          - group [ref=f2e226]:
            - generic "Propose confirmed facts for the existing listing" [ref=f2e227]
        - region "Room capture checklist" [ref=f2e228]:
          - heading "Room capture checklist" [level=2] [ref=f2e229]
          - paragraph [ref=f2e230]: Save rooms, the current room and your clip uploads to continue later. Uploaded clips remain private and require validation before processing.
          - button "Start room capture" [ref=f2e231] [cursor=pointer]
          - region "Validate uploaded room clips" [ref=f2e232]:
            - heading "Validate uploaded room clips" [level=3] [ref=f2e233]
            - paragraph [ref=f2e234]: Choose a completed clip up to 10 MiB. Scanning keeps the original private; codec validation and frame extraction are separate processing actions.
            - generic [ref=f2e235]:
              - text: Completed capture clip
              - combobox "Completed capture clip" [ref=f2e236]:
                - option "Choose completed clip" [selected]
            - button "Scan private clip" [disabled] [ref=f2e237]
            - button "Reload clip source status" [disabled] [ref=f2e238]
            - button "Add scanned clip to property sources" [disabled] [ref=f2e239]
            - status
        - region "Training frame privacy" [ref=f2e240]:
          - heading "Training frame privacy" [level=2] [ref=f2e241]
          - paragraph [ref=f2e242]: Inspect selected frames and exclude whole frames or supply black mask rectangles in original upright pixels. Automatic sensitive-region detection is unavailable. Privacy review, coverage, poses and scale remain unverified.
          - button "Reload private frame scope" [ref=f2e243] [cursor=pointer]
          - paragraph [ref=f2e244]: No selected frame dataset is available yet.
        - region "Private panorama capture review" [ref=f2e245]:
          - heading "Private panorama captures" [level=2] [ref=f2e246]
          - paragraph [ref=f2e247]: Preview captures and record their room links. These candidates remain unconfirmed and require source review.
          - generic [ref=f2e248]:
            - heading "No processed panorama captures" [level=3] [ref=f2e252]
            - paragraph [ref=f2e253]: Add an authorized 360 capture to preview its private image tiers.
          - status
        - region "Private plan editor" [ref=f2e254]:
          - heading "Plan trace" [level=2] [ref=f2e255]
          - paragraph [ref=f2e256]: Private, estimated scale · geometry review pending · heights unknown · saved revision 1
          - status
          - button "Reload saved trace" [ref=f2e257] [cursor=pointer]
          - generic [ref=f2e258]:
            - generic [ref=f2e259]:
              - generic [ref=f2e260]: Source page
              - combobox "Source page" [ref=f2e261]:
                - option "Source 1 · page 1" [selected]
            - generic [ref=f2e262]:
              - generic [ref=f2e263]: Clockwise deskew (degrees)
              - spinbutton "Clockwise deskew (degrees)" [disabled] [ref=f2e264]: "0"
            - generic [ref=f2e265]:
              - generic [ref=f2e266]: Source opacity
              - slider "Source opacity" [ref=f2e267]: "0.65"
            - generic [ref=f2e268]:
              - generic [ref=f2e269]: Zoom
              - combobox "Plan zoom" [ref=f2e270]:
                - option "100%" [selected]
                - option "150%"
                - option "200%"
                - option "300%"
                - option "400%"
          - generic [ref=f2e271]:
            - button "Draw wall" [disabled] [pressed] [ref=f2e272]
            - button "Move wall" [disabled] [ref=f2e273]
            - button "Draw room boundary" [disabled] [ref=f2e274]
            - generic [ref=f2e275]:
              - checkbox "Snap to 8-pixel grid" [ref=f2e276]
              - text: Snap to 8-pixel grid
            - button "Pan left" [ref=f2e277] [cursor=pointer]
            - button "Pan right" [ref=f2e278] [cursor=pointer]
            - button "Pan up" [ref=f2e279] [cursor=pointer]
            - button "Pan down" [ref=f2e280] [cursor=pointer]
          - generic [ref=f2e281]:
            - button "Undo trace edit" [disabled] [ref=f2e282]
            - button "Redo trace edit" [disabled] [ref=f2e283]
            - status
          - img "Plan drawing canvas" [ref=f2e284]:
            - generic [ref=f2e285]:
              - generic "Private plan source overlay"
              - generic: Room
          - group "Supplied vertical dimensions for Ground" [ref=f2e287]:
            - paragraph [ref=f2e289]: Missing dimensions stay empty. Entries retain your source note and remain unverified; they do not approve the geometry.
            - generic [ref=f2e290]:
              - text: Supplied floor height (metres)
              - textbox "Supplied floor height (metres)" [ref=f2e291]: "3"
            - generic [ref=f2e292]:
              - text: Dimension source note
              - textbox "Dimension source note" [ref=f2e293]
            - generic [ref=f2e294]:
              - checkbox "These are supplied dimensions; they remain unverified." [ref=f2e295]
              - text: These are supplied dimensions; they remain unverified.
            - button "Save supplied dimensions" [ref=f2e296] [cursor=pointer]
          - group "Independent structural model review" [ref=f2e297]:
            - generic [ref=f2e299]:
              - text: Assigned model reviewer
              - combobox "Assigned model reviewer" [ref=f2e300]:
                - option "Choose a reviewer" [selected]
                - option "Admin Demo"
                - option "Moderator Demo"
            - generic [ref=f2e301]:
              - checkbox "I have current owner consent to share this private model candidate with the assigned reviewer." [ref=f2e302]
              - text: I have current owner consent to share this private model candidate with the assigned reviewer.
            - button "Request independent model review" [disabled] [ref=f2e303]
          - region "Structural plan viewer" [ref=f2e304]:
            - paragraph [ref=f2e305]: Private structural preview · supplied dimensions remain unverified · geometry review pending.
            - button "Open 3D preview" [ref=f2e306] [cursor=pointer]
          - paragraph [ref=f2e307]: 0 walls · 1 labeled rooms · 0 openings · estimated metre coordinates · geometry review pending
          - generic [ref=f2e308]:
            - button "Suggest source lines" [disabled] [ref=f2e309]
            - button "Save private trace" [disabled] [ref=f2e310]
            - button "Delete selected wall" [disabled] [ref=f2e311]
            - link "Preview saved drawing" [ref=f2e312] [cursor=pointer]:
              - /url: /api/v1/ops/digitizations/fc178f15-21b7-438b-95a6-ed2492c9c974/geometry/preview.svg
            - link "Preview saved floor PNG" [ref=f2e313] [cursor=pointer]:
              - /url: /api/v1/ops/digitizations/fc178f15-21b7-438b-95a6-ed2492c9c974/geometry/preview.png?floorId=ground
            - link "Download private structural GLB" [ref=f2e314] [cursor=pointer]:
              - /url: /api/v1/ops/digitizations/fc178f15-21b7-438b-95a6-ed2492c9c974/geometry/preview.glb
          - group "Select a traced wall" [ref=f2e315]
          - group "Room label and boundary" [ref=f2e317]:
            - generic [ref=f2e319]:
              - generic [ref=f2e320]: Room label
              - textbox "Room label" [disabled] [ref=f2e321]: Room
            - paragraph [ref=f2e322]: 0 boundary vertices · choose vertices on the source, then close the boundary.
            - button "Close room boundary" [disabled] [ref=f2e323]
            - button "Undo boundary vertex" [disabled] [ref=f2e324]
            - generic [ref=f2e325]:
              - text: Room
              - button "Delete room Room" [disabled] [ref=f2e326]: Delete room
          - group "Opening on selected wall" [ref=f2e327]:
            - generic [ref=f2e329]:
              - generic [ref=f2e330]: Opening type
              - combobox "Opening type" [disabled] [ref=f2e331]:
                - option "Door" [disabled] [selected]
                - option "Window" [disabled]
            - generic [ref=f2e332]:
              - generic [ref=f2e333]: Opening start on wall (pixels)
              - textbox "Opening start on wall (pixels)" [disabled] [ref=f2e334]: "0"
            - generic [ref=f2e335]:
              - generic [ref=f2e336]: Opening width (pixels)
              - textbox "Opening width (pixels)" [disabled] [ref=f2e337]: "20"
            - generic [ref=f2e338]:
              - checkbox "I confirmed this opening position on the source page." [disabled] [ref=f2e339]
              - text: I confirmed this opening position on the source page.
            - paragraph [ref=f2e340]: Opening and sill heights remain unknown.
            - button "Add opening" [disabled] [ref=f2e341]
          - group "Floors and room boundaries" [ref=f2e342]:
            - paragraph [ref=f2e344]: Floors are separate unregistered drawings. Heights and relative elevations remain unknown; stairs record the selected connection only.
            - generic [ref=f2e345]:
              - generic [ref=f2e346]: Active floor
              - combobox "Active floor" [disabled] [ref=f2e347]:
                - option "Ground" [disabled] [selected]
            - generic [ref=f2e348]:
              - generic [ref=f2e349]: New floor name
              - textbox "New floor name" [disabled] [ref=f2e350]: Upper floor
            - button "Add unregistered floor" [disabled] [ref=f2e351]
            - generic [ref=f2e352]:
              - generic [ref=f2e353]: Stair destination floor
              - combobox "Stair destination floor" [disabled] [ref=f2e354]:
                - option "Choose destination" [disabled] [selected]
            - button "Connect selected floors with stair" [disabled] [ref=f2e355]
            - paragraph [ref=f2e356]: 0 floor connections · vertical dimensions unknown
            - generic [ref=f2e357]:
              - generic [ref=f2e358]: Room to edit
              - combobox "Room to edit" [disabled] [ref=f2e359]:
                - option "Choose room" [disabled] [selected]
                - option "Room" [disabled]
            - generic [ref=f2e360]:
              - generic [ref=f2e361]: First split vertex (1-based)
              - spinbutton "First split vertex" [disabled] [ref=f2e362]: "1"
            - generic [ref=f2e363]:
              - generic [ref=f2e364]: Last split vertex (1-based)
              - spinbutton "Last split vertex" [disabled] [ref=f2e365]: "3"
            - paragraph [ref=f2e366]: A split uses a valid diagonal between existing vertices. Merge requires a shared complete edge. Holes need a separately traced boundary.
            - button "Split selected room" [disabled] [ref=f2e367]
            - generic [ref=f2e368]:
              - generic [ref=f2e369]: Second room to merge
              - combobox "Second room to merge" [disabled] [ref=f2e370]:
                - option "Choose second room" [disabled] [selected]
                - option "Room" [disabled]
            - button "Merge selected rooms" [disabled] [ref=f2e371]
          - group "Observed scale reference" [ref=f2e372]:
            - paragraph [ref=f2e374]: Save the unscaled trace and select a wall with an independently supplied length. Calibration creates estimated scale; geometry review and all heights remain pending.
            - generic [ref=f2e375]:
              - generic [ref=f2e376]: Reference distance (metres)
              - textbox "Reference distance (metres)" [disabled] [ref=f2e377]
            - generic [ref=f2e378]:
              - generic [ref=f2e379]: Reference source note
              - textbox "Reference source note" [disabled] [ref=f2e380]
            - generic [ref=f2e381]:
              - checkbox "I independently checked the supplied reference length." [disabled] [ref=f2e382]
              - text: I independently checked the supplied reference length.
            - button "Use reference as estimated scale" [disabled] [ref=f2e383]
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
> 16 |    await login(staff,'moderator',origin,'/ops');const queueReady=staff.waitForResponse(response=>response.url().endsWith('/api/v1/ops/digitization-model-publication-reviews')&&response.request().method()==='GET',{timeout:40000});await staff.goto(origin+'/ops/reviews');const queueResponse=await queueReady;expect(queueResponse.status()).toBe(200);expect((await queueResponse.json()).data.some((row:{revisionId:string})=>row.revisionId===proposal.revisionId)).toBe(true);const article=staff.locator(`[data-model-publication-review-id="${proposal.revisionId}"]`);await expect(article).toBeVisible();
     |                                                                                                                                                                                                                                                                                                                                                  ^ Error: expect(received).toBe(expected) // Object.is equality
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