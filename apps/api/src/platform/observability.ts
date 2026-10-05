import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

const sensitiveKey = /authorization|cookie|token|secret|password|email|phone|contact|private_address|encrypted|otp/i;
const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const credential = /\b(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gi;
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(email, '[REDACTED]').replace(credential, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redact(item)]));
  return value;
}
export function logEvent(event: Record<string, unknown>) {
  console.log(JSON.stringify(redact({ timestamp: new Date().toISOString(), ...event })));
}
let workspace = process.cwd();
while (!existsSync(join(workspace, 'pnpm-workspace.yaml')) && dirname(workspace) !== workspace) workspace = dirname(workspace);
export const requiredMigrations = readdirSync(join(workspace, 'packages/database/migrations')).filter(name => name.endsWith('.sql')).sort();
type Database = { query: (query: { text: string; query_timeout: number }) => Promise<{ rows: { name: string }[] }> };
export async function checkReadiness(database: Database, expected = requiredMigrations) {
  try {
    const result = await database.query({ text: 'SELECT name FROM schema_migrations ORDER BY name', query_timeout: 1500 });
    const installed = new Set(result.rows.map(row => row.name));
    return { status: expected.every(name => installed.has(name)) ? 'ready' : 'not_ready', database: 'up', migrations: expected.every(name => installed.has(name)) ? 'current' : 'incomplete' };
  } catch {
    return { status: 'not_ready', database: 'unavailable', migrations: 'unknown' };
  }
}
// Bounded process metrics contain route templates, never query strings or request bodies.
const requests = new Map<string, { count: number; failures: number; durationMs: number }>();
const started = new WeakMap<object, number>();
export function traceStart(request: object) { started.set(request, performance.now()); }
export function traceEnd(request: object, route: string, status: number) {
  const metric = requests.get(route) ?? { count: 0, failures: 0, durationMs: 0 };
  metric.count++; metric.failures += status >= 500 ? 1 : 0;
  metric.durationMs += Math.max(0, performance.now() - (started.get(request) ?? performance.now()));
  if (requests.size < 200 || requests.has(route)) requests.set(route, metric);
  return metric;
}
export function requestMetrics() {
  return [...requests].map(([route, value]) => ({ route, count: value.count, failures: value.failures, averageDurationMs: Math.round(value.durationMs / value.count) }));
}
