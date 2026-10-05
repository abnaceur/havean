import { expect, it } from 'vitest';
import { redact, traceStart, traceEnd, requestMetrics } from '../../apps/api/src/platform/observability';
it('redacts nested secret/contact fields, embedded email and bearer fixtures', () => {
 const output = JSON.stringify(redact({ authorization: 'Bearer private-token', cookie: 'haven_session=private-session', detail: { email: 'private@example.test', password: 'password-fixture', safe: 'Request from private@example.test with Bearer private-token' }, list: [{ refresh_token: 'refresh-fixture' }] }));
 expect(output).not.toMatch(/private-token|private-session|private@example|password-fixture|refresh-fixture/);
 expect(output).toContain('[REDACTED]');
});
it('aggregates trace timings by route template', () => {
 const request = {}; traceStart(request); traceEnd(request, '/api/v1/listings/:id', 503);
 expect(requestMetrics()).toContainEqual({ route: '/api/v1/listings/:id', count: 1, failures: 1, averageDurationMs: expect.any(Number) });
});
