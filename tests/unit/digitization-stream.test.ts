import {afterEach,expect,it,vi} from 'vitest';
import {forwardDigitizationStream} from '../../apps/ops/src/digitization-stream';
afterEach(()=>vi.restoreAllMocks());
it('HE-R04 dedicated BFF forwards authorized resume headers, returns chunks immediately and propagates cancellation',async()=>{
 let cancelled=false;const upstream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('id: 12\ndata: {"state":"queued"}\n\n'));},cancel(){cancelled=true;}});
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(upstream,{headers:{'content-type':'text/event-stream'}}));
 const response=await forwardDigitizationStream(new Request('http://localhost:8089/events',{headers:{cookie:'haven_session=test-private-ticket','last-event-id':'11','x-organization-id':'scoped-org'}}),'/api/v1/ops/digitization-intakes/10000000-0000-4000-8000-000000000001/events');
 const options=fetcher.mock.calls[0][1]!,headers=new Headers(options.headers);expect(headers.get('last-event-id')).toBe('11');expect(headers.get('cookie')).toBe('haven_session=test-private-ticket');expect(response.headers.get('x-accel-buffering')).toBe('no');const reader=response.body!.getReader();expect(new TextDecoder().decode((await reader.read()).value)).toContain('id: 12');await reader.cancel();expect(cancelled).toBe(true);expect(options.signal!.aborted).toBe(true);
});
it('HE-R04 preserves upstream session expiration and refuses a buffered non-stream success',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({error:{code:'SESSION_EXPIRED'}},{status:401}));expect((await forwardDigitizationStream(new Request('http://localhost/events'),'/private/events')).status).toBe(401);
 fetcher.mockResolvedValueOnce(Response.json({data:{}}));expect((await forwardDigitizationStream(new Request('http://localhost/events'),'/private/events')).status).toBe(503);
});
