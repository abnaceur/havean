-- Public read port: return only the assigned, active, verified agency agent.
-- Private profile and membership state never enter the public serialization.
CREATE FUNCTION public_listing_agents(target uuid) RETURNS TABLE(id uuid,name text,slug text,biography text,languages text[],districts text[],"verifiedUntil" date,photo text,"publicEmail" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT a.id,a.name,a.slug,a.biography,a.languages,a.districts,a.verified_until,a.photo,a.public_email
 FROM public_listings p JOIN listings l ON l.id=p.id JOIN agents a ON a.id=l.agent_id AND a.organization_id=l.organization_id
 JOIN profiles person ON person.id=a.user_id JOIN cities city ON city.slug=p.city
 WHERE p.id=target AND person.state='active' AND a.verified_until>=(now() AT TIME ZONE city.timezone)::date
 AND EXISTS(SELECT 1 FROM memberships member WHERE member.user_id=a.user_id AND member.organization_id=a.organization_id AND member.status='active' AND member.role IN('agent','agency_manager'))
$$;
