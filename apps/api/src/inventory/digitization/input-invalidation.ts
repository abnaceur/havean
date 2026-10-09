import type pg from 'pg';
import type {Actor} from '@haven/database';
import {revisionChange,type RevisionSource} from './revision-policy.js';
/** Source snapshots/approvals stay immutable. Earlier approved public packages
 * are preserved; this record prevents applying a stale approval to new inputs. */
export async function recordInputChange(c:pg.PoolClient,a:Actor,engine:string,previous:number,current:number,before:readonly RevisionSource[]|null,after:readonly RevisionSource[]){
 const change=revisionChange(before,after);
 await c.query('INSERT INTO digitization_input_changes(digitization_id,organization_id,created_by,previous_revision,input_revision,documents_changed,plans_changed,media_changed,domains) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[engine,a.orgId,a.id,previous,current,change.documentsChanged,change.plansChanged,change.mediaChanged,change.domains]);
 await c.query(`INSERT INTO digitization_approval_invalidations(digitization_id,organization_id,created_by,approval_id,input_revision,reason)
 SELECT $1,$2,$3,a.id,$4,CASE WHEN $5 THEN 'document_inputs_changed' WHEN $6 THEN 'plan_inputs_changed' ELSE 'media_inputs_changed' END
 FROM approval_records a WHERE a.digitization_id=$1 AND a.input_revision<=$7 AND a.decision='approved' AND
 (a.scope='facts' AND $5 OR a.scope='geometry' AND ($5 OR $6) OR a.scope IN('artifact','package') AND ($5 OR $6 OR $8))
 ON CONFLICT(approval_id,input_revision) DO NOTHING`,[engine,a.orgId,a.id,current,change.documentsChanged,change.plansChanged,previous,change.mediaChanged]);
 return change;
}
