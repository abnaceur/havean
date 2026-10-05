import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {beijingFixtures} from '../../packages/test-support/src/fixtures';
import {ownerSchema} from '../../packages/contracts/src/domain';
describe('F10/F11 deterministic English fixtures',()=>{
 it('reproduces stored IDs, content and fixed dates exactly',()=>{
  const first=beijingFixtures(),second=beijingFixtures();expect(first).toEqual(second);expect(first).toEqual(JSON.parse(fs.readFileSync('packages/test-support/fixtures/beijing.json','utf8')));
  expect(new Set(first.listings.map(l=>l.id)).size).toBe(102);expect(new Set(first.personas.map(p=>p.id)).size).toBe(11);
  expect(first.personas.find(p=>p.roles.includes('agent'))?.organizationId).not.toBe(first.personas.find(p=>p.email==='outsider@example.test')?.organizationId);
 });
 it('has the required main inventory counts and privacy/availability edges',()=>{
  const f=beijingFixtures(),main=f.listings.slice(0,100);
  expect(main.filter(l=>l.transaction==='sale'&&l.segment==='residential')).toHaveLength(60);expect(main.filter(l=>l.transaction==='rent')).toHaveLength(30);expect(main.filter(l=>l.segment==='commercial')).toHaveLength(10);expect(f.developments).toHaveLength(8);
  expect(f.listings.some(l=>l.price===null)).toBe(true);expect(f.listings.some(l=>l.status==='sold')).toBe(true);expect(f.listings.some(l=>!l.photos.length)).toBe(true);expect(f.listings.some(l=>l.organizationId!==f.organizations[0].id)).toBe(true);
  expect(f.floorPlans.every(p=>p.photo===null)).toBe(true);
 });
 it('uses English visible content and schema-valid decimal property facts',()=>{
  const f=beijingFixtures();expect(JSON.stringify(f)).not.toMatch(/[\u3400-\u9fff]/);
  for(const l of f.listings.filter(l=>l.price!==null))expect(()=>ownerSchema.parse({title:l.title,transaction:l.transaction,districtId:f.districts.find(d=>d.id===f.communities.find(c=>c.id===l.unit.communityId)?.districtId)?.id,communityId:l.unit.communityId,area:l.unit.area,beds:l.unit.beds,livingRooms:l.unit.livingRooms,price:l.price,description:l.description,contact:'fixture@example.test',consent:true})).not.toThrow();
 });
});
