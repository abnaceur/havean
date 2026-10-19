import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {draftUnit,digitizationDraftReceipt,type DigitizationDraftCreate} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {createInventoryDraft} from '../drafts.js';
import {prepareConfirmedUnitFacts} from './inventory-fact-mapping.js';
import {prepareUnitForm} from './unit-form.js';

/** A new private draft is created through inventory's existing port. The intake
 * target, original evidence, grants and decisions remain immutable and private. */
export async function createIntakeInventoryDraft(c:pg.PoolClient,a:Actor,engine:string,x:DigitizationDraftCreate){
 const {workspace,candidates}=await prepareConfirmedUnitFacts(c,a,engine,x);
 if(workspace.target.type!=='intake')fail(422,'Use the reviewed application workflow for an existing listing.','INTAKE_TARGET_REQUIRED');
 if((await c.query('SELECT id FROM digitization_intake_draft_links WHERE digitization_id=$1',[engine])).rowCount)fail(409,'This intake already created an inventory draft.','INTAKE_ALREADY_APPLIED');
 const form=prepareUnitForm(candidates,x.manualUnit);
 if(!form.ready)fail(422,'Explicitly complete all required unit fields before creating the draft.','UNIT_FACTS_INCOMPLETE');
 const listing=await createInventoryDraft(c,a,{...x.listing,unit:draftUnit.parse(form.values)});
 const link=(await c.query('INSERT INTO digitization_intake_draft_links(digitization_id,organization_id,created_by,workspace_version,input_revision,listing_id,unit_id,decision_ids,unit_provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[engine,a.orgId,a.id,workspace.version,x.inputRevision,listing.id,listing.unit_id,x.decisionIds,JSON.stringify(form.provenance)])).rows[0];
 await c.query('UPDATE property_digitizations SET version=version+1 WHERE id=$1',[engine]);
 await event(c,a,engine,'digitization.intake_draft_created',{listingId:listing.id,inputRevision:x.inputRevision});
 return digitizationDraftReceipt.parse({id:link.id,listingId:listing.id,unitId:listing.unit_id,workspaceVersion:workspace.version+1,listingVersion:1,status:'draft',sourceEvidenceTransferred:false,reviewRequired:true});
}
