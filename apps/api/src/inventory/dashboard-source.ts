// Trusted read projection composed into one database snapshot by the dashboard controller.
// authority is its verified agency-membership CTE; $1/$2 are selected agency/actor.
export const dashboardInventorySource=`SELECT l.id,l.title,l.status,l.currency,l.price::text AS price,l.version,l.updated_at FROM listings l LEFT JOIN agents a ON a.id=l.agent_id CROSS JOIN authority auth WHERE l.organization_id=$1 AND l.status NOT IN('sold','leased','archived') AND (auth.team OR a.user_id=$2)`;
