import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationUnitApplicationCreate,digitizationUnitFactsChange,digitizationUnitApplicationContext} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
import {digitizationListingAccess} from '../property-access.js';
import {submitListingRevision} from '../revisions.js';
import {prepareConfirmedUnitChange} from './inventory-fact-mapping.js';

/** Public scalar proposals use the existing independent moderation queue.
 * Private source/decision lineage stays in the engine-owned immutable table. */
export async function submitDigitizationUnitApplication(c:pg.PoolClient,a:Actor,engine:string,input:z.infer<typeof digitizationUnitApplicationCreate>){
 const x=digitizationUnitApplicationCreate.parse(input),selection=await prepareConfirmedUnitChange(c,a,engine,x);
 const unitVersion=(await c.query('SELECT version FROM inventory_unit_fact_versions WHERE unit_id=$1',[selection.unitId])).rows[0]?.version;
 if(!unitVersion)fail(409,'Physical unit version is unavailable.');
 let location,geographyVersions={};
 if(x.communityId){
  if(!x.locationConfirmed)fail(422,'Confirm the canonical community explicitly.','LOCATION_CONFIRMATION_REQUIRED');
  // Authors may read canonical geography, but cannot acquire editor row locks.
  // The immutable proposal snapshots versions; independent approval locks and
  // rechecks every version before the shared unit can change.
  const geo=(await c.query(`SELECT community.id,community.name,community.version,district.name AS district_name,district.version AS district_version,city.name AS city_name,city.version AS city_version FROM communities community JOIN districts district ON district.id=community.district_id JOIN cities city ON city.id=district.city_id WHERE community.id=$1 AND community.status='active' AND district.status='active' AND city.status='active'`,[x.communityId])).rows[0];
  if(!geo)fail(422,'Select an active canonical community.','LOCATION_SELECTION_REQUIRED');
  selection.unitPatch={...selection.unitPatch,...{communityId:geo.id}};
  location={communityId:geo.id,communityName:geo.name,districtName:geo.district_name,cityName:geo.city_name};
  geographyVersions={community:geo.version,district:geo.district_version,city:geo.city_version};
 }
 const unitFacts=digitizationUnitFactsChange.parse({unitVersion,patch:selection.unitPatch,...(location?{location}:{})});
 const listing=(await c.query('SELECT title,price::text FROM listings WHERE id=$1',[selection.listingId])).rows[0];
 const revision=await submitListingRevision(c,a,selection.listingId,{title:listing.title,price:listing.price,version:x.listingVersion,reason:x.reason,unitFacts});
 await c.query(`INSERT INTO digitization_inventory_applications(revision_id,digitization_id,organization_id,created_by,input_revision,unit_id,unit_version,unit_patch,decision_ids,geography_versions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[revision.id,engine,a.orgId,a.id,x.inputRevision,selection.unitId,unitVersion,JSON.stringify(unitFacts.patch),x.decisionIds,JSON.stringify(geographyVersions)]);
 return {revisionId:revision.id,listingId:selection.listingId,status:revision.status,version:revision.version,unitFacts};
}

/** Current inventory projection for an authorized author. Private identifiers,
 * source text and financial data are not needed by the proposal form. */
export async function readUnitApplicationContext(c:pg.PoolClient,a:Actor,engine:string){
 await requireDigitizationAgency(c,a);const w=await checkedWorkspace(c,engine);
 let listing=null;
 const intakeListingId=w.target.type==='intake'?(await c.query('SELECT listing_id FROM digitization_intake_draft_links WHERE digitization_id=$1',[engine])).rows[0]?.listing_id??null:null;
 if(w.target.type==='listing'){
  const scoped=await digitizationListingAccess(c,a,w.target.id);
  const row=(await c.query(`SELECT l.title,u.area::text,u.beds,u.living_rooms,u.baths,u.community_id,v.version AS unit_version,
   (SELECT id FROM listing_revisions WHERE listing_id=l.id AND status='pending' ORDER BY created_at DESC,id DESC LIMIT 1) AS pending_revision
   FROM listings l JOIN units u ON u.id=l.unit_id JOIN inventory_unit_fact_versions v ON v.unit_id=u.id WHERE l.id=$1`,[scoped.id])).rows[0];
  if(!row)fail(404,'Current inventory facts are unavailable.');
  listing={id:scoped.id,title:row.title,version:scoped.version,status:scoped.status,unitVersion:row.unit_version,current:{area:row.area,beds:row.beds,livingRooms:row.living_rooms,baths:row.baths,communityId:row.community_id},pendingRevisionId:row.pending_revision};
 }
 return digitizationUnitApplicationContext.parse({workspaceVersion:w.version,inputRevision:w.inputRevision,workspaceState:w.state,intakeListingId,listing});
}
