import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {CpuRunnerClient} from '../../apps/api/src/inventory/digitization/runner-client';
import type {DigitizationExecutionRequest} from '../../packages/contracts/src/digitization';
const origin=process.env.DIGITIZATION_RUNNER_TEST_ORIGIN;
// Explicit isolated real runner command; ordinary DB CI does not infer this acceptance.
it.skipIf(!origin)('HE-C03 API transport sends scoped source bytes to a real Python runner and observes its actual raster output',async()=>{
 const text='BT /F1 12 Tf 20 150 Td (Unit number: 00123) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 const source=Buffer.from(pdf),request:DigitizationExecutionRequest={schemaVersion:1,executionId:crypto.randomUUID(),organizationId:crypto.randomUUID(),runId:crypto.randomUUID(),stageId:crypto.randomUUID(),stageType:'document_rasterize',profileId:'pdfium-150dpi-v1',inputRevision:1,inputFingerprint:'a'.repeat(64),fencingToken:'1',artifacts:[{id:crypto.randomUUID(),checksum:createHash('sha256').update(source).digest('hex'),byteSize:String(source.length),detectedMime:'application/pdf'}],deadline:new Date(Date.now()+120000).toISOString(),budget:{maxSeconds:15,maxScratchBytes:'67108864'}};
 const client=new CpuRunnerClient(origin!,Buffer.from('test-only-private-key-not-a-production-credential-0000'));
 await expect(client.submit(request,Buffer.from('forged bytes'))).rejects.toThrow('RUNNER_SOURCE_MISMATCH');
 const state=await client.submit(request,source);expect(['pending','running','succeeded']).toContain(state.state);
 let finished=state;const deadline=Date.now()+10000;while(['pending','running'].includes(finished.state)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));finished=await client.read(request);}
 expect(finished.state).toBe('succeeded');const result=finished.result as {pages:{nativeText:string;sha256:string;previewFilename:string}[];ocrAvailable:boolean};expect(result.pages[0].nativeText).toContain('00123');expect(result.pages[0].sha256).toMatch(/^[a-f0-9]{64}$/);expect(result.ocrAvailable).toBe(false);
 expect((await client.submit(request,source)).state).toBe('succeeded');
 const preview=await client.preview(request,result.pages[0].sha256);
 expect(preview.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
 expect(createHash('sha256').update(preview).digest('hex')).toBe(result.pages[0].sha256);
 await expect(client.preview({...request,organizationId:crypto.randomUUID()},result.pages[0].sha256)).rejects.toThrow('RUNNER_REQUEST_FAILED_404');
 await expect(client.preview(request,request.artifacts[0].checksum)).rejects.toThrow('RUNNER_REQUEST_FAILED_404');
 await expect(client.read({...request,organizationId:crypto.randomUUID()})).rejects.toThrow('RUNNER_REQUEST_FAILED_404');
 const outsider=new CpuRunnerClient(origin!,Buffer.from('wrong-test-key-with-more-than-thirty-two-bytes'));
 await expect(outsider.read(request)).rejects.toThrow('RUNNER_REQUEST_FAILED_401');
 await expect(outsider.preview(request,result.pages[0].sha256)).rejects.toThrow('RUNNER_REQUEST_FAILED_401');
 expect((await fetch(origin+'/'+result.pages[0].previewFilename)).status).toBe(404);
 const extraction={...request,executionId:crypto.randomUUID(),stageId:crypto.randomUUID(),stageType:'fact_extract' as const,profileId:'generic-native-facts-en-v1'};
 let extracted=await client.submit(extraction,source);const extractionDeadline=Date.now()+10000;
 while(['pending','running'].includes(extracted.state)&&Date.now()<extractionDeadline){await new Promise(resolve=>setTimeout(resolve,100));extracted=await client.read(extraction);}
 expect(extracted.state).toBe('succeeded');
 const facts=extracted.result as {candidates:{field:string;normalizedValue:unknown;evidence:{assetId:string;quotedText:string}[]}[];ocrAvailable:boolean;reviewRequired:boolean};
 expect(facts.candidates).toHaveLength(1);expect(facts.candidates[0]).toMatchObject({field:'unitId',normalizedValue:'00123'});
 expect(facts.candidates[0].evidence[0]).toMatchObject({assetId:request.artifacts[0].id,quotedText:'Unit number: 00123'});
 expect(facts.ocrAvailable).toBe(false);expect(facts.reviewRequired).toBe(true);
},20000);
