import type pg from 'pg';
import {fail} from '../platform/core.js';
// Inventory owns public eligibility and snapshot admission for complaint context.
export async function supportListingSource(c:pg.PoolClient,id:string,version:number){const r=(await c.query('SELECT support_listing_source($1) source',[id])).rows[0].source as {id:string;version:number;title:string;url:string}|null;if(!r)fail(404,'Currently published listing not found');if(r.version!==version)fail(409,'Listing changed. Refresh the complaint context');return r;}
