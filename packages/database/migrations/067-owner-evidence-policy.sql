-- Historical attachment labels describe upload purpose, not verified legal ownership.
UPDATE market_config SET data=data||'{"requiredOwnerEvidenceTypes":["ownership"]}'::jsonb,version=version+1 WHERE NOT data ? 'requiredOwnerEvidenceTypes';
UPDATE owner_submissions s SET data=s.data||jsonb_build_object('documentTypes',coalesce((SELECT jsonb_object_agg(value,'ownership') FROM jsonb_array_elements_text(coalesce(s.data->'documents','[]'::jsonb))),'{}'::jsonb)) WHERE NOT data ? 'documentTypes';
UPDATE owner_submissions s SET data=s.data||jsonb_build_object('city',ci.slug) FROM communities co JOIN districts d ON d.id=co.district_id JOIN cities ci ON ci.id=d.city_id WHERE s.data->>'communityId'=co.id::text AND NOT s.data ? 'city';
