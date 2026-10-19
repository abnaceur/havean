-- Private camera proposals cannot grant navigation or metric approval.
CREATE FUNCTION digitization_scene_ring(ring jsonb) RETURNS geometry LANGUAGE sql IMMUTABLE STRICT SET search_path=public,pg_temp AS $$
 SELECT ST_MakePolygon(ST_AddPoint(ST_MakeLine(array_agg(ST_MakePoint((p->>'x')::double precision,(p->>'y')::double precision) ORDER BY n)),ST_MakePoint((ring->0->>'x')::double precision,(ring->0->>'y')::double precision))) FROM jsonb_array_elements(ring) WITH ORDINALITY vertex(p,n);
$$;
CREATE FUNCTION digitization_scene_camera_valid(camera jsonb,plan jsonb,floor_id text,matrix jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public,pg_temp AS $$
DECLARE room jsonb;floor jsonb;point geometry;axis integer;expected double precision;actual double precision;
BEGIN
 IF jsonb_typeof(camera) IS DISTINCT FROM 'object' OR camera->>'id' IS NULL OR camera->>'id' !~ '^[a-zA-Z0-9_-]{1,80}$' OR camera->>'roomId' IS NULL OR camera->>'roomId' !~ '^[a-zA-Z0-9_-]{1,80}$' OR camera->>'label' IS NULL OR length(trim(camera->>'label')) NOT BETWEEN 1 AND 80 OR jsonb_typeof(camera->'scene') IS DISTINCT FROM 'array' OR jsonb_array_length(camera->'scene')<>3 OR jsonb_typeof(camera->'planPosition') IS DISTINCT FROM 'array' OR jsonb_array_length(camera->'planPosition')<>3 THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(camera) key WHERE key NOT IN('id','roomId','label','scene','planPosition')) THEN RETURN false;END IF;
 FOR axis IN 0..2 LOOP
  IF jsonb_typeof(camera->'scene'->axis) IS DISTINCT FROM 'number' OR jsonb_typeof(camera->'planPosition'->axis) IS DISTINCT FROM 'number' OR abs((camera->'scene'->>axis)::double precision)>1000000 THEN RETURN false;END IF;
  actual:=(camera->'planPosition'->>axis)::double precision;
  expected:=(matrix->>(axis*4))::double precision*(camera->'scene'->>0)::double precision+(matrix->>(axis*4+1))::double precision*(camera->'scene'->>1)::double precision+(matrix->>(axis*4+2))::double precision*(camera->'scene'->>2)::double precision+(matrix->>(axis*4+3))::double precision;
  IF abs(actual)>1000000 OR abs(actual-expected)>0.00000001 THEN RETURN false;END IF;
 END LOOP;
 SELECT f INTO floor FROM jsonb_array_elements(plan->'floors') f WHERE f->>'id'=floor_id;
 SELECT r INTO room FROM jsonb_array_elements(plan->'rooms') r WHERE r->>'id'=camera->>'roomId' AND r->>'floorId'=floor_id;
 IF floor IS NULL OR room IS NULL OR (camera->'planPosition'->>2)::double precision<(floor->>'elevation')::double precision OR floor->'height'<>'null'::jsonb AND (camera->'planPosition'->>2)::double precision>(floor->>'elevation')::double precision+(floor->'height'->>'amount')::double precision THEN RETURN false;END IF;
 point:=ST_MakePoint((camera->'planPosition'->>0)::double precision,(camera->'planPosition'->>1)::double precision);
 IF NOT ST_Contains(digitization_scene_ring(room->'polygon'),point) OR EXISTS(SELECT 1 FROM jsonb_array_elements(room->'holes') hole WHERE ST_Covers(digitization_scene_ring(hole),point)) THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION digitization_scene_registration_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE workspace property_digitizations;geometry geometry_revisions;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Scene registration estimates are immutable' USING ERRCODE='23514';END IF;
 SELECT * INTO workspace FROM property_digitizations WHERE id=NEW.digitization_id FOR UPDATE;
 SELECT * INTO geometry FROM geometry_revisions WHERE digitization_id=NEW.digitization_id ORDER BY revision DESC LIMIT 1;
 IF workspace.id IS NULL OR workspace.state<>'active' OR workspace.organization_id<>NEW.organization_id OR workspace.version<>NEW.workspace_version OR workspace.current_input_revision<>NEW.input_revision OR NEW.created_by<>actor_id() OR NOT digitization_revision_access(NEW.digitization_id,NEW.input_revision,'document_processing') THEN RAISE EXCEPTION 'Current scoped workspace, actor and version required' USING ERRCODE='42501';END IF;
 IF geometry.id IS DISTINCT FROM NEW.geometry_revision_id OR geometry.input_revision IS DISTINCT FROM NEW.input_revision OR geometry.geometry->>'unit'<>'m' OR geometry.scale_status NOT IN('estimated','measured') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(geometry.geometry->'floors') floor WHERE floor->>'id'=NEW.floor_id) OR NOT EXISTS(SELECT 1 FROM artifacts ar JOIN processing_stages s ON s.id=ar.stage_id WHERE ar.id=NEW.scene_artifact_id AND ar.digitization_id=NEW.digitization_id AND ar.input_revision=NEW.input_revision AND ar.status='private' AND (ar.quality_report->>'kind'='splat_scene' OR ar.quality_report->>'kind'='splat_viewer_tier' AND ar.quality_report->>'encoding'='splat32-wxyz-v1') AND ar.format IN('application/x-ply','application/octet-stream') AND s.state='succeeded' AND s.stage_type IN('splat_train','scene_export')) THEN RAISE EXCEPTION 'Current private scene and metric plan required' USING ERRCODE='23514';END IF;
 IF NEW.registration->>'scaleStatus' IS DISTINCT FROM 'estimated' OR NEW.registration->>'reviewStatus' IS DISTINCT FROM 'pending' OR NEW.registration->>'metricMeasurementsAvailable' IS DISTINCT FROM 'false' OR NEW.registration->>'planNavigationAvailable' IS DISTINCT FROM 'false' OR NEW.registration->>'publiclyServed' IS DISTINCT FROM 'false' OR (NEW.registration->>'metresPerSceneUnit')::NUMERIC IS DISTINCT FROM NEW.metres_per_scene_unit OR jsonb_typeof(NEW.registration->'sceneToPlan') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.registration->'sceneToPlan')<>16 THEN RAISE EXCEPTION 'Pending estimate cannot grant metric measurements, navigation or publication' USING ERRCODE='23514';END IF;
 IF NEW.registration ? 'cameraAnchors' THEN
  IF jsonb_typeof(NEW.registration->'cameraAnchors') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.registration->'cameraAnchors')>50 THEN RAISE EXCEPTION 'Bounded private camera anchors required' USING ERRCODE='23514';END IF;
  IF (SELECT count(DISTINCT camera->>'id') FROM jsonb_array_elements(NEW.registration->'cameraAnchors') camera)<>jsonb_array_length(NEW.registration->'cameraAnchors') OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.registration->'cameraAnchors') camera WHERE NOT digitization_scene_camera_valid(camera,geometry.geometry,NEW.floor_id,NEW.registration->'sceneToPlan')) THEN RAISE EXCEPTION 'Camera anchor must match its pending transform and room' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
