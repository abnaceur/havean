import type pg from 'pg';
// Read only after resolving current public listing eligibility, in the same transaction.
export async function publicRentalTerms(c:pg.PoolClient,listingId:string){
 const row=(await c.query(`SELECT t.rental_mode AS mode,t.billing_period AS "billingPeriod",t.deposit_amount::text AS "depositAmount",t.currency,t.minimum_months AS "minimumMonths",t.utilities,t.move_in_date::text AS "moveInDate",t.room_attributes AS "roomAttributes",u.unit_kind AS "unitKind",u.room_label AS "roomLabel" FROM rental_terms t JOIN listings l ON l.id=t.listing_id JOIN units u ON u.id=l.unit_id WHERE t.listing_id=$1`,[listingId])).rows[0];
 return row??null;
}
