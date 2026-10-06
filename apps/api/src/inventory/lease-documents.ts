import type pg from 'pg';
import type {Actor} from '@haven/database';
import {fail} from '../platform/core.js';
export async function leaseDocument(c:pg.PoolClient,a:Actor,id:string,version:number,owned=true){const m=(await c.query("SELECT id,version,object_key,mime FROM lease_document_asset_lock($1) WHERE id=$1 AND version=$2 AND status='approved' AND scan_at IS NOT NULL AND purpose='document' AND visibility='private' AND mime='application/pdf'"+(owned?' AND owner_id=$3':''),owned?[id,version,a.id]:[id,version])).rows[0];if(!m)fail(404,'Approved owned private PDF with this version is required');return m;}
export async function leaseUnit(c:pg.PoolClient,id:string,org:string){const unit=(await c.query('SELECT management_lease_unit($1,$2) AS unit',[id,org])).rows[0].unit;if(!unit)fail(404,'Currently granted canonical property not found');return unit;}
