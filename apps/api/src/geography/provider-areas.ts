import type pg from 'pg';
import {fail} from '../platform/core.js';
// Read-only geography port for service-owned profiles.
export async function providerAreas(c:pg.PoolClient,city:string,ids:string[]){const r=await c.query("SELECT d.id,d.name FROM districts d JOIN cities ci ON ci.id=d.city_id WHERE ci.slug=$1 AND ci.status='active' AND d.status='active' AND d.id=ANY($2::uuid[]) ORDER BY d.name,d.id",[city,ids]);if(new Set(ids).size!==ids.length||r.rowCount!==ids.length)fail(400,'Select active service areas in this city');return r.rows;}
