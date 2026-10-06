import type pg from 'pg';
import {fail} from '../platform/core.js';
// Services calls inventory's read/lock port; no provider mutates an asset here.
export async function providerPhoto(c:pg.PoolClient,owner:string,id:string,version:number){const r=(await c.query("SELECT id FROM media_assets WHERE id=$1 AND owner_id=$2 AND version=$3 AND visibility='public' AND status='approved' AND scan_at IS NOT NULL AND purpose='photo' AND variants->>'display' IS NOT NULL FOR SHARE",[id,owner,version])).rows[0];if(!r)fail(404,'Select a current scanned public photo you own');return r;}
