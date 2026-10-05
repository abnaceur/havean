import pg from 'pg';
import fixtures from '../../test-support/fixtures/beijing.json' with {type:'json'};
const pool=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL});
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const person=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const c=await pool.connect();
try{
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(902107)');
 if((await c.query('SELECT 1 FROM cities LIMIT 1')).rowCount){console.log('Existing fixtures retained');}
 else{
  for(const org of fixtures.organizations)await c.query('INSERT INTO organizations VALUES($1,$2,$3)',[org.id,org.name,org.type]);
  for(const [i,p] of fixtures.personas.entries()){
   await c.query('INSERT INTO profiles(id,subject,display_name,email,created_at) VALUES($1,$2,$3,$4,$5)',[p.id,p.subject,p.displayName,p.email,fixtures.clock]);
   for(const [j,role] of p.roles.entries())await c.query('INSERT INTO memberships(id,user_id,organization_id,role) VALUES($1,$2,$3,$4)',[id(6000+i*10+j),p.id,['admin','moderator','support','editor'].includes(role)?null:p.organizationId,role]);
  }
  const city=fixtures.city;await c.query('INSERT INTO cities(id,slug,name,country,currency,timezone) VALUES($1,$2,$3,$4,$5,$6)',[city.id,city.slug,city.name,city.country,city.currency,city.timezone]);
  for(const d of fixtures.districts)await c.query('INSERT INTO districts(id,city_id,name,slug) VALUES($1,$2,$3,$4)',[d.id,d.cityId,d.name,d.slug]);
  for(const co of fixtures.communities)await c.query('INSERT INTO communities(id,district_id,slug,name,address,built_year,amenities,photos,location) VALUES($1,$2,$3,$4,$5,$6,$7,$8,ST_SetSRID(ST_MakePoint($9,$10),4326)::geography)',[co.id,co.districtId,co.slug,co.name,co.address,co.builtYear,co.amenities,co.photos,co.longitude,co.latitude]);
  for(const a of fixtures.agents)await c.query('INSERT INTO agents(id,user_id,organization_id,name,slug,biography,languages,districts,verified_until,public_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[a.id,a.userId,a.organizationId,a.name,a.slug,a.biography,a.languages,a.districts,a.verifiedUntil,a.publicEmail]);
  for(const l of fixtures.listings){
   const u=l.unit;await c.query('INSERT INTO units(id,community_id,organization_id,area,beds,living_rooms,baths,orientation,floor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[u.id,u.communityId,u.organizationId,u.area,u.beds,u.livingRooms,u.baths,u.orientation,u.floor]);
   await c.query('INSERT INTO unit_private_details(unit_id,organization_id,private_address) VALUES($1,$2,$3)',[u.id,u.organizationId,u.privateAddress]);
   await c.query('INSERT INTO listings(id,unit_id,organization_id,owner_id,agent_id,slug,title,description,transaction,segment,currency,price,rent_period,status,features,photos,furnishing,available_from,published_at,created_at,updated_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20,$4)',[l.id,l.unitId,l.organizationId,l.ownerId,l.agentId,l.slug,l.title,l.description,l.transaction,l.segment,l.currency,l.price,l.rentPeriod,l.status,l.features,l.photos,l.furnishing,l.availableFrom,l.publishedAt,fixtures.clock]);
  }
  for(const d of fixtures.developments)await c.query('INSERT INTO developments(id,organization_id,community_id,slug,name,description,status,price_min,price_max,completion_date,photos,features,inventory_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[d.id,d.organizationId,d.communityId,d.slug,d.name,d.description,'draft',d.priceMin,d.priceMax,d.completionDate,d.photos,d.features,d.inventoryAt]);
  for(const p of fixtures.floorPlans)await c.query('INSERT INTO floor_plans(id,development_id,name,beds,living_rooms,area,available,photo,area_min,area_max,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$6,$6,(SELECT inventory_at FROM developments WHERE id=$2))',[p.id,p.developmentId,p.name,p.beds,p.livingRooms,p.area,p.available,p.photo]);
  for(const d of fixtures.developments){await c.query("UPDATE development_publication SET state='legacy_published',reason='Synthetic bootstrap fixture; independent project approval is not claimed.' WHERE development_id=$1",[d.id]);await c.query('UPDATE developments SET status=$2 WHERE id=$1',[d.id,d.status]);}
  for(const p of fixtures.providers)await c.query('INSERT INTO providers VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[p.id,p.organizationId,p.slug,p.name,p.description,p.categories,p.districts,p.photos,p.status]);
  await c.query('INSERT INTO management_grants(id,organization_id,unit_id,owner_id,expires_at) VALUES($1,$2,$3,$4,$5)',[id(5200),id(2),id(1060),person(2),'2030-12-31']);
  await c.query('INSERT INTO tenants(id,organization_id,user_id,name,email) VALUES($1,$2,$3,$4,$5)',[id(5000),id(2),person(5),'Tenant Demo','tenant@example.test']);
  await c.query('INSERT INTO leases(id,organization_id,unit_id,tenant_id,start_date,end_date,rent,currency,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(5100),id(2),id(1060),id(5000),'2026-10-01','2027-09-30','6500.00','CNY','active']);
  await c.query('INSERT INTO market_config VALUES($1,$2,1)',['bj',JSON.stringify({name:'Beijing',currency:'CNY',timezone:'Asia/Shanghai',areaUnit:'m²',annualRate:'3.50',rentPeriod:'month',supportEmail:'support@example.test',demo:true})]);
  for(let i=0;i<100;i++)await c.query('INSERT INTO outbox(id,aggregate_id,kind,payload,created_at) VALUES($1,$2,$3,$4,$5)',[id(8000+i),id(2000+i),'listing.seeded','{}',fixtures.clock]);
  console.log('Seeded deterministic synthetic Beijing inventory and 11 role personas');
 }
 for(const l of fixtures.listings){
  if(l.residential){const r=l.residential;await c.query('INSERT INTO residential_details(listing_id,finishing,heating,ownership_attributes,holding_period_attributes,occupancy) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM listings WHERE id=$1) ON CONFLICT DO NOTHING',[l.id,r.finishing,r.heating,r.ownershipAttributes,r.holdingPeriodAttributes,r.occupancy]);}
  if(l.commercial){const r=l.commercial;await c.query('INSERT INTO commercial_details(listing_id,property_type,gross_area,usable_area,fit_out,floor,parking_spaces,permitted_uses,rent_basis,sale_basis,area_basis,legacy_incomplete) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true WHERE EXISTS(SELECT 1 FROM listings WHERE id=$1) ON CONFLICT DO NOTHING',[l.id,r.propertyType,r.grossArea,r.usableArea,r.fitOut,r.floor,r.parkingSpaces,r.permittedUses,l.transaction==='rent'?r.rentBasis:null,l.transaction==='sale'?r.rentBasis:null,null]);}
  if(l.rental){const r=l.rental;await c.query('INSERT INTO rental_terms(listing_id,rental_mode,minimum_months,deposit_amount,currency,billing_period,utilities,move_in_date,room_attributes) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE EXISTS(SELECT 1 FROM listings WHERE id=$1) ON CONFLICT DO NOTHING',[l.id,r.rentalMode,r.minimumMonths,r.depositAmount,r.currency,r.billingPeriod,r.utilities,r.moveInDate,r.roomAttributes]);}
 }
 for(const city of fixtures.additionalCities){await c.query('INSERT INTO cities(id,slug,name,country,currency,timezone) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[city.id,city.slug,city.name,city.country,city.currency,city.timezone]);await c.query('INSERT INTO market_config(id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[city.slug,JSON.stringify({name:city.name,currency:city.currency,timezone:city.timezone,areaUnit:'m²',annualRate:'3.50',rentPeriod:'month',supportEmail:'support@example.test',demo:true})]);}
 for(const d of fixtures.additionalDistricts)await c.query('INSERT INTO districts(id,city_id,name,slug) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[d.id,d.cityId,d.name,d.slug]);
 for(const n of fixtures.neighborhoods)await c.query('INSERT INTO neighborhoods(id,district_id,slug,name,aliases) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[n.id,n.districtId,n.slug,n.name,n.aliases]);
 for(const line of fixtures.transitLines)await c.query('INSERT INTO transit_lines(id,city_id,slug,name,aliases) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[line.id,line.cityId,line.slug,line.name,line.aliases]);
 for(const station of fixtures.transitStations)await c.query('INSERT INTO transit_stations(id,city_id,line_id,district_id,slug,name,aliases,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',[station.id,station.cityId,station.lineId,station.districtId,station.slug,station.name,station.aliases,station.latitude,station.longitude]);
 for(const b of fixtures.buildings)await c.query('INSERT INTO buildings(id,community_id,slug,name,floors,completed_year) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[b.id,b.communityId,b.slug,b.name,b.floors,b.completedYear]);
 for(const co of fixtures.communities)await c.query('UPDATE communities SET neighborhood_id=$2 WHERE id=$1 AND neighborhood_id IS NULL',[co.id,fixtures.neighborhoods.find(n=>n.districtId===co.districtId)!.id]);
 await c.query("UPDATE units SET building_id=b.id FROM buildings b WHERE units.community_id=b.community_id AND b.slug='building-a' AND units.id=ANY($1::uuid[]) AND units.building_id IS NULL",[fixtures.listings.map(l=>l.unitId)]);
 await c.query("UPDATE market_config SET data=data||$1::jsonb WHERE id='bj' AND NOT data ? 'pricePresets'",[JSON.stringify({pricePresets:[{label:'Up to 4 million',transaction:'sale',min:'0',max:'4000000'},{label:'4–6 million',transaction:'sale',min:'4000000',max:'6000000'},{label:'Above 6 million',transaction:'sale',min:'6000000'},{label:'Up to 5,000/month',transaction:'rent',min:'0',max:'5000'}]})]);
 await c.query('COMMIT');console.log('Geography and building fixtures present; existing edits preserved');
}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await pool.end();}
