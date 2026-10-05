import type pg from 'pg';
import type {Actor} from '@haven/database';
import {fail} from '../platform/core.js';
export async function requireOwnerGrant(c:pg.PoolClient,_actor:Actor,unitId:string,version?:number){const row=(await c.query("SELECT id,version FROM current_owner_unit_grant($1)",[unitId])).rows[0];if(!row)fail(404,'A current owner grant for this property was not found.','OWNER_GRANT_UNAVAILABLE');if(version!==undefined&&version!==row.version)fail(409,'Your property grant changed. Refresh and try again.','OWNER_GRANT_CHANGED');return row;}
export async function recordReviewedOwnerGrant(c:pg.PoolClient,actor:Actor,listingId:string){const row=(await c.query("INSERT INTO owner_unit_grants(unit_id,owner_id,source,source_listing_id,verified_by) SELECT unit_id,owner_id,'reviewed_submission',id,$2 FROM listings WHERE id=$1 AND owner_id IS NOT NULL RETURNING id",[listingId,actor.id])).rows[0];if(!row)fail(409,'The reviewed ownership relationship is unavailable.');return row;}
