import type pg from 'pg';
import {fail} from '../platform/core.js';
// Call only after loading/scoping the listing or management grant. The lock is
// held through the caller's transaction, including its atomic state mutation.
export async function lockRentalAvailability(c:pg.PoolClient,unitId:string){return (await c.query('SELECT lock_rental_scope($1) AS root',[unitId])).rows[0].root as string;}
export async function requireRentalAvailability(c:pg.PoolClient,unitId:string,listingId?:string){await lockRentalAvailability(c,unitId);if(!(await c.query('SELECT rental_unit_is_free($1,$2) AS available',[unitId,listingId??null])).rows[0].available)fail(409,'This property or room is occupied. Refresh its availability before proceeding.','RENTAL_UNAVAILABLE');}
