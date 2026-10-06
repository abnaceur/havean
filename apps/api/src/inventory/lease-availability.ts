import type pg from 'pg';
import {event,type Actor} from '@haven/database';
export async function withdrawLeaseOffers(c:pg.PoolClient,a:Actor,unitId:string,organizationId:string){const rows=(await c.query('SELECT * FROM withdraw_lease_rental_offers($1,$2)',[unitId,organizationId])).rows;for(const offer of rows)await event(c,a,offer.id,'listing.leased',{version:offer.version,source:'lease_activation'});return rows;}
