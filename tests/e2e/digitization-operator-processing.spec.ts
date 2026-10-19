import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {login} from '../support/browser';
function pdf(){
 const stream='BT /F1 12 Tf 20 160 Td (Unit number: 00123) Tj 0 -20 Td (City: Dubai; Plot number: 00123; 2 bedrooms) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let text='%PDF-1.4\n';const offsets:number[]=[];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(text));text+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(text);
}
test('operator uploads arbitrary-layout PDF and actual queue/CPU processing produces private source-linked review facts',async({page},info)=>{
 if(process.env.HAVEN_RECOVERY_REHEARSAL==='true')test.setTimeout(420000);
 const {engineId}=JSON.parse(readFileSync(`infra/generated/integration/operator-processing-${info.project.name}.json`,'utf8')),origin='http://localhost:8089';
 await login(page,'agent',origin,'/ops');await page.goto(origin+'/ops/digitization?workspace='+engineId);
 const panel=page.getByRole('region',{name:'Private source processing'});
 await panel.getByLabel('Choose property source',{exact:true}).setInputFiles({name:'arbitrary-property-information.pdf',mimeType:'application/pdf',buffer:pdf()});
 await panel.getByLabel('Source rights and origin',{exact:true}).fill('Self-authored CI document; no representative accuracy claim.');await panel.getByRole('checkbox',{name:'I am authorized to upload and process this property source.'}).check();
 await panel.getByRole('button',{name:'Upload private source',exact:true}).click();await expect(panel.getByRole('status')).toHaveText('Source saved privately. Select a processing action below.');
 await panel.getByRole('button',{name:'Extract available facts',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Processing queued.');
 await expect(panel.getByText(/Run 1 · revision 1 · awaiting_review/)).toBeVisible({timeout:process.env.HAVEN_RECOVERY_REHEARSAL==='true'?240000:45000});
 const summary=page.getByRole('region',{name:'Private property quality summary'});await summary.getByRole('button',{name:'Reload quality summary',exact:true}).click();await expect(summary.getByText('4 source facts · 4 awaiting review · 0 pages still requiring text extraction')).toBeVisible();
 const review=page.getByRole('region',{name:'Private document fact review'});await review.getByRole('button',{name:'Reload document facts',exact:true}).click();
 const response=await page.request.get(origin+'/api/v1/ops/digitizations/'+engineId+'/facts');expect(response.status()).toBe(200);const facts=(await response.json()).data.candidates;
 expect(facts.map((f:any)=>f.field).sort()).toEqual(['bedrooms','city','plotId','unitId']);expect(facts.every((f:any)=>f.review.status==='pending')).toBe(true);
 const city=facts.find((f:any)=>f.field==='city');expect(city.normalizedValue).toBe('Dubai');expect(facts.find((f:any)=>f.field==='plotId').normalizedValue).toBe('00123');
 await review.getByLabel('Source fact',{exact:true}).selectOption(city.id);await expect(review.getByRole('blockquote')).toContainText('City: Dubai');await expect(review.getByRole('img',{name:'Source crop for city, page 1'})).toBeVisible();
 const leaked=JSON.stringify((await (await page.request.get(origin+'/api/v1/ops/digitizations/'+engineId+'/sources')).json()));expect(leaked).not.toMatch(/object_key|quarantine|sourceSha256/);
});
