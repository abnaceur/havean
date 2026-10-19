-- One execution per maintenance lease. A large capture cannot reset or exceed
-- the cleanup lease by processing every stage in one HTTP command.
CREATE FUNCTION digitization_advance_deletion_run(job_ref uuid,fence_ref text,execution_ref uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job digitization_deletion_jobs;remaining jsonb;
BEGIN
 IF actor_id() IS DISTINCT FROM '00000000-0000-4000-8000-000000000010'::uuid THEN RAISE EXCEPTION 'Trusted deletion maintenance identity required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM digitization_deletion_jobs WHERE id=job_ref AND kind='stop_run' AND fence::text=fence_ref AND state='pending' AND lease_until>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF jsonb_array_length(job.metadata->'stages')=0 THEN RETURN digitization_finish_deletion_job(job.id,fence_ref);END IF;
 IF (job.metadata->'stages'->0->>'execution_id')::uuid IS DISTINCT FROM execution_ref THEN RAISE EXCEPTION 'Exact cleanup execution required' USING ERRCODE='40001';END IF;
 remaining:=(job.metadata->'stages')-0;
 UPDATE digitization_deletion_jobs SET metadata=jsonb_set(metadata,'{stages}',remaining)||jsonb_build_object('stoppedExecutions',coalesce(metadata->'stoppedExecutions','[]'::jsonb)||CASE WHEN execution_ref IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(execution_ref) END) WHERE id=job.id;
 IF jsonb_array_length(remaining)=0 THEN RETURN digitization_finish_deletion_job(job.id,fence_ref);END IF;
 UPDATE digitization_deletion_jobs SET lease_until=NULL WHERE id=job.id;RETURN true;
END $$;
REVOKE ALL ON FUNCTION digitization_advance_deletion_run(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digitization_advance_deletion_run(uuid,text,uuid) TO haven_app;
