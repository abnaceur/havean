import type {Actor} from '@haven/database';
import type pg from 'pg';
import {z} from 'zod';
import {fail,transaction} from '../../platform/core.js';
import {digitizationListingAccess} from '../property-access.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {latestTourApproval} from './tour-review.js';
import {projectReviewedTourForInventory} from './inventory-tour-projection.js';
import {tourScope,verifyTourSources} from './tours.js';

const request=z.strictObject({workspaceVersion:z.number().int().positive(),inputRevision:z.number().int().positive(),listingVersion:z.number().int().positive(),approvalId:z.uuid(),approvalVersion:z.literal(1),tourRevisionId:z.uuid(),publicationConsent:z.literal(true)});
type Request=z.infer<typeof request>;

async function currentContext(c:pg.PoolClient,a:Actor,engine:string,x:Request){
 await requireDigitizationAgency(c,a);
 const workspace=await checkedWorkspace(c,engine);
 if(workspace.state!=='active'||workspace.target.type!=='listing')fail(409,'An active listing digitization is required.');
 const listing=await digitizationListingAccess(c,a,workspace.target.id);
 if(workspace.version!==x.workspaceVersion||workspace.inputRevision!==x.inputRevision||listing.version!==x.listingVersion)fail(409,'The listing, inputs or workspace changed.');
 if(listing.status!=='published')fail(409,'This preparation requires a pending revision of a published listing.');
 const approval=await latestTourApproval(c,a,engine);
 if(!approval||approval.id!==x.approvalId||approval.version!==x.approvalVersion||approval.inputRevision!==x.inputRevision||approval.tourRevisionId!==x.tourRevisionId||approval.decision!=='approved'||!approval.manifest||!approval.privacyConfirmed||!approval.projectionConfirmed)fail(409,'Select the current independently approved tour.');
 const tour=(await c.query('SELECT id,revision FROM tour_revisions WHERE digitization_id=$1 ORDER BY revision DESC LIMIT 1',[engine])).rows[0];
 if(tour?.id!==approval.tourRevisionId)fail(409,'The approved tour was superseded.');
 return {listingId:listing.id,listingVersion:listing.version,approval,input:{workspaceVersion:workspace.version,inputRevision:workspace.inputRevision,baseTourRevision:tour.revision,graph:approval.manifest}};
}

/** Internal preparation for the reviewed inventory port. No proposal, public
 * asset or access grant is written. Caller-supplied approvals cannot authorize
 * this operation; persisted current scope is read before and after byte checks. */
export async function prepareReviewedTourInventoryChange(a:Actor,engine:string,value:unknown){
 z.uuid().parse(engine);const x=request.parse(value);
 const before=await transaction(a,c=>currentContext(c,a,engine,x));
 const verified=await verifyTourSources(a,engine,before.input);
 return transaction(a,async c=>{
  const after=await currentContext(c,a,engine,x),fresh=await tourScope(c,a,engine,after.input);
  if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(verified)!==JSON.stringify(fresh))fail(409,'The approved tour source or inventory authority changed during preparation.');
  return {listingId:after.listingId,listingVersion:after.listingVersion,approvalId:after.approval.id,approvalVersion:after.approval.version,inputRevision:after.approval.inputRevision,...projectReviewedTourForInventory(after.approval,x)};
 });
}
