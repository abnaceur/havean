import type pg from 'pg';
import type {Actor} from '@haven/database';
import {digitizationUnitApplicationCreate,digitizationUnitFactsChange} from '@haven/contracts';
import type {z} from 'zod';
import {fail} from '../../platform/core.js';
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
  const geo=(await c.query(`SELECT community.id,community.name,community.version,district.name AS district_name,district.version AS district_version,city.name AS city_name,city.version AS city_version FROM communities community JOIN districts district ON district.id=community.district_id JOIN cities city ON city.id=district.city_id WHERE community.id=$1 AND community.status='active' AND district.status='active' AND city.status='active' FOR SHARE OF community,district,city`,[x.communityId])).rows[0];
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
