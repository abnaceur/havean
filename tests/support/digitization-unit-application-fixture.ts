import './env';
import {writeFileSync} from 'node:fs';
import {pool,transaction,type Actor} from '../../packages/database/src/index';
import {createListingDigitization} from '../../apps/api/src/inventory/digitization/intakes';
const actor:Actor={id:'00000000-0000-4000-8000-000000000003',orgId:'10000000-0000-4000-8000-000000000001',roles:['agent']},admin:Actor={id:'00000000-0000-4000-8000-000000000010',orgId:null,roles:['admin']};
if(process.env.HAVEN_CONTAINER_TESTS!=='true')throw Error('Isolated Compose fixture required');
try{for(const project of ['desktop','mobile']){
 // Published baseline and second agency mandate are synthetic test state. The
 // proposed native document facts and subsequent review are real workflows.
 const fixture=await transaction(admin,async c=>{
  const unit=(await c.query("INSERT INTO units(community_id,organization_id,area,beds,living_rooms,baths) SELECT community_id,organization_id,'88.50',2,1,1 FROM units WHERE id='10000000-0000-4000-8000-000000001000' RETURNING id")).rows[0].id;
  const listing=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,organization_id,owner_id,agent_id,$2,'Synthetic document unit review','Authored native document software fixture only','sale','residential','CNY','2500000.25','published' FROM listings WHERE id='10000000-0000-4000-8000-000000002000' RETURNING id",[unit,'document-unit-review-'+crypto.randomUUID()])).rows[0].id;
  await c.query("INSERT INTO listing_mandates(unit_id,organization_id,owner_id,expires_at) SELECT $1,'10000000-0000-4000-8000-000000000005',owner_id,now()+interval '30 days' FROM listings WHERE id=$2",[unit,listing]);
  const sibling=(await c.query("INSERT INTO listings(unit_id,organization_id,owner_id,slug,title,description,transaction,segment,currency,price,status) SELECT $1,'10000000-0000-4000-8000-000000000005',owner_id,$2,'Synthetic shared unit mandate','Authored isolation fixture only','sale','residential','CNY','2600000.75','published' FROM listings WHERE id=$3 RETURNING id",[unit,'document-unit-sibling-'+crypto.randomUUID(),listing])).rows[0].id;
  return {listingId:listing,siblingId:sibling,unitId:unit};
 });
 const workspace=await transaction(actor,c=>createListingDigitization(c,actor,fixture.listingId,1));writeFileSync(`infra/generated/integration/unit-application-${project}.json`,JSON.stringify({...fixture,engineId:workspace.id})+'\n');
}}finally{await pool.end();}
