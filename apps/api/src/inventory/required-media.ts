import type pg from 'pg';
import {fail} from '../platform/core.js';
/** Caller locks and authorizes the listing before checking its current media. */
export async function missingListingMedia(c:pg.PoolClient,id:string,published=false,excluding?:string){
 const rows=(await c.query(`SELECT DISTINCT lm.kind FROM listing_media lm JOIN media_assets a ON a.id=lm.asset_id
 WHERE lm.listing_id=$1 AND lm.kind IN ('photo','floor_plan') AND lm.kind=a.purpose
 AND lm.status=ANY($2::text[]) AND a.status='approved' AND a.scan_at IS NOT NULL AND a.visibility='public'
 AND coalesce(a.variants->>'display','')<>'' AND ($3::uuid IS NULL OR lm.id<>$3)`,[id,published?['approved']:['draft','approved'],excluding||null])).rows;
 const kinds=new Set(rows.map(row=>row.kind));return ['photo','floor_plan'].filter(kind=>!kinds.has(kind));
}
export async function requireListingMedia(c:pg.PoolClient,id:string,published=false,excluding?:string){
 if((await missingListingMedia(c,id,published,excluding)).length)fail(409,published?'Publication requires approved property photos and a floor plan.':'Add at least one property photo and a floor plan before submitting.','REQUIRED_PROPERTY_MEDIA');
}
