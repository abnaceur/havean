SELECT 'charges',count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY id),''),'UTF8')),'hex') FROM charges t;
SELECT 'payments',count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY id),''),'UTF8')),'hex') FROM payments t;
SELECT 'deposits',count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY id),''),'UTF8')),'hex') FROM deposits t;
SELECT 'allocations',count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY id),''),'UTF8')),'hex') FROM allocations t;
