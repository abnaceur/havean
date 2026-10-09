import {afterEach,expect,it,vi} from 'vitest';
import {forwardCaptureCompletion} from '../../apps/ops/src/digitization-capture-completion';
afterEach(()=>vi.restoreAllMocks());
const origin=()=>process.env.PUBLIC_APP_URL||process.env.PUBLIC_WEB_URL||'http://localhost:8088';
it('interrupted metadata never reaches the API or reveals stream diagnostics',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');
 const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{'));controller.error(new Error('private transport details'));}});
 const req=new Request(origin()+'/complete',{method:'POST',headers:{origin:origin(),'content-type':'application/json'},body,duplex:'half'} as RequestInit);
 const response=await forwardCaptureCompletion(req,'/private');
 expect(response.status).toBe(400);expect(await response.text()).not.toContain('private transport details');expect(fetcher).not.toHaveBeenCalled();
});
it('capture completion forwards only small metadata/session/idempotency context and streams the quarantine response',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({data:{status:'quarantined',processingEligible:false}},{status:202}));
 const req=new Request(origin()+'/api/capture/complete',{method:'POST',headers:{origin:origin(),'content-type':'application/json',cookie:'haven_session=private-fixture','idempotency-key':'fixture-complete-001','x-organization-id':'fixture-org'},body:JSON.stringify({version:2,checksum:'a'.repeat(64)})});
 const response=await forwardCaptureCompletion(req,'/api/v1/ops/digitization-intakes/fixture/capture-uploads/fixture/complete');
 expect(response.status).toBe(202);expect((await response.json()).data.processingEligible).toBe(false);
 const options=fetcher.mock.calls[0][1]!,headers=new Headers(options.headers);expect(headers.get('cookie')).toBe('haven_session=private-fixture');expect(headers.get('idempotency-key')).toBe('fixture-complete-001');expect(headers.get('x-organization-id')).toBe('fixture-org');
 expect(JSON.parse(new TextDecoder().decode(options.body as Uint8Array))).toEqual({version:2,checksum:'a'.repeat(64)});expect(options.signal!.aborted).toBe(false);
});
it('capture JSON route rejects large declared or streamed bodies before API/storage work and preserves CSRF',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');
 const input=(headers:Record<string,string>,body:string)=>new Request(origin()+'/complete',{method:'POST',headers:{origin:origin(),'content-type':'application/json',...headers},body});
 expect((await forwardCaptureCompletion(input({'content-length':'2147483648'},'{}'),'/private')).status).toBe(413);
 expect((await forwardCaptureCompletion(input({},'x'.repeat(2049)),'/private')).status).toBe(413);
 expect((await forwardCaptureCompletion(input({origin:'https://foreign.example.test'},'{}'),'/private')).status).toBe(403);
 expect((await forwardCaptureCompletion(input({'content-type':'video/mp4'},'{}'),'/private')).status).toBe(415);
 expect(fetcher).not.toHaveBeenCalled();
});
it('client disconnect terminates stalled metadata and never forwards a partial completion',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch'),abort=new AbortController(),cancel=vi.fn();
 const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel});
 const req=new Request(origin()+'/complete',{method:'POST',headers:{origin:origin(),'content-type':'application/json'},body,signal:abort.signal,duplex:'half'} as RequestInit);
 const pending=forwardCaptureCompletion(req,'/private');abort.abort();
 const response=await pending;expect(response.status).toBe(400);expect(cancel).toHaveBeenCalledOnce();expect(fetcher).not.toHaveBeenCalled();
});
