-- Publication uses the inventory listing revision, never a runner or author approval.
CREATE TABLE digitization_publication_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),digitization_id uuid NOT NULL REFERENCES property_digitizations,
 organization_id uuid NOT NULL REFERENCES organizations,created_by uuid NOT NULL REFERENCES profiles,
 version int NOT NULL DEFAULT 1 CHECK(version=1),input_revision int NOT NULL,workspace_version int NOT NULL,
 listing_revision_id uuid NOT NULL UNIQUE REFERENCES listing_revisions,approval_id uuid NOT NULL,
 tour_review_request_id uuid NOT NULL REFERENCES digitization_tour_review_requests,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(approval_id,digitization_id) REFERENCES approval_records(id,digitization_id),
 FOREIGN KEY(digitization_id,input_revision) REFERENCES property_input_revisions(digitization_id,revision)
);
ALTER TABLE digitization_publication_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposal_read ON digitization_publication_proposals FOR SELECT USING(created_by=actor_id() AND digitization_target_access(digitization_id) OR EXISTS(SELECT 1 FROM digitization_tour_review_requests q WHERE q.id=tour_review_request_id AND q.reviewer_id=actor_id() AND digitization_current_tour_reviewer(actor_id())));
CREATE POLICY proposal_create ON digitization_publication_proposals FOR INSERT WITH CHECK(created_by=actor_id() AND organization_id=org_id() AND digitization_revision_access(digitization_id,input_revision,'document_processing'));
CREATE FUNCTION digitization_publication_current(proposal_ref uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM digitization_publication_proposals p JOIN digitization_tour_review_requests q ON q.id=p.tour_review_request_id JOIN approval_records a ON a.id=p.approval_id JOIN property_digitizations d ON d.id=p.digitization_id JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
 WHERE p.id=proposal_ref AND p.created_by=q.created_by AND p.organization_id=q.organization_id AND p.digitization_id=q.digitization_id AND p.input_revision=q.input_revision AND p.workspace_version=q.workspace_version AND digitization_tour_review_current(q.id)
 AND a.decision='approved' AND a.scope='artifact' AND a.snapshot->>'kind'='reviewed_tour' AND a.snapshot->>'tourReviewRequestId'=q.id::text AND a.snapshot->>'privacyConfirmed'='true' AND a.snapshot->>'projectionConfirmed'='true'
 AND NOT EXISTS(SELECT 1 FROM digitization_approval_invalidations i WHERE i.approval_id=a.id AND i.input_revision<=p.input_revision)
 AND d.target_type='listing' AND d.target_id=l.id AND r.actor_id=p.created_by AND r.changes->'digitizationPackage'->>'approvalId'=a.id::text AND r.changes->'digitizationPackage'->>'engineId'=d.id::text AND NOT(r.changes ? 'unitFacts')
 AND r.status='pending' AND l.status='published' AND l.version=r.base_version)
$$;
CREATE FUNCTION digitization_publication_proposal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' OR NEW.created_by<>actor_id() OR NEW.organization_id<>org_id() THEN RAISE EXCEPTION 'Immutable current author proposal required' USING ERRCODE='42501';END IF;
 IF NOT digitization_publication_current(NEW.id) THEN RAISE EXCEPTION 'Current independently reviewed tour and listing revision required' USING ERRCODE='40001';END IF;RETURN NEW;
END $$;
CREATE TRIGGER publication_proposal_guard AFTER INSERT OR UPDATE OR DELETE ON digitization_publication_proposals FOR EACH ROW EXECUTE FUNCTION digitization_publication_proposal_guard();

ALTER TABLE published_packages ADD COLUMN publication_number int NOT NULL DEFAULT 1 CHECK(publication_number>0),ADD COLUMN listing_revision_id uuid UNIQUE REFERENCES listing_revisions;
CREATE UNIQUE INDEX published_listing_number ON published_packages(listing_id,publication_number);
CREATE TABLE digitization_public_package_bindings(
 package_id uuid NOT NULL REFERENCES published_packages,node_slot text NOT NULL CHECK(node_slot ~ '^node-[0-9]+$'),tier_slot text NOT NULL CHECK(tier_slot ~ '^tier-[1-3]$'),
 artifact_id uuid NOT NULL REFERENCES artifacts,PRIMARY KEY(package_id,node_slot,tier_slot)
);
ALTER TABLE digitization_public_package_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY binding_read ON digitization_public_package_bindings FOR SELECT USING(EXISTS(SELECT 1 FROM published_packages p WHERE p.id=package_id AND digitization_private_access(p.digitization_id)));
CREATE TABLE digitization_package_revocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),package_id uuid NOT NULL UNIQUE REFERENCES published_packages,created_by uuid NOT NULL REFERENCES profiles,package_version int NOT NULL CHECK(package_version=1),reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE digitization_package_revocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY revoke_read ON digitization_package_revocations FOR SELECT USING(EXISTS(SELECT 1 FROM published_packages p WHERE p.id=package_id AND digitization_target_access(p.digitization_id)));
CREATE FUNCTION digitization_publication_review_context(revision_ref uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p digitization_publication_proposals;q digitization_tour_review_requests;
BEGIN
 SELECT * INTO p FROM digitization_publication_proposals WHERE listing_revision_id=revision_ref;IF p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO q FROM digitization_tour_review_requests WHERE id=p.tour_review_request_id;
 IF q.reviewer_id<>actor_id() OR p.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) THEN RAISE EXCEPTION 'Independent assigned publication reviewer required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM property_digitizations WHERE id=p.digitization_id FOR UPDATE;
 IF NOT digitization_publication_current(p.id) THEN RAISE EXCEPTION 'Publication dependencies changed' USING ERRCODE='40001';END IF;
 RETURN digitization_tour_review_context(q.id);
END $$;
-- The immutable package approval is tied to the exact current inventory proposal.
CREATE OR REPLACE FUNCTION digitization_package_freshness_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.listing_revision_id IS NULL OR NOT EXISTS(SELECT 1 FROM approval_records a JOIN digitization_publication_proposals p ON p.id::text=a.snapshot->>'proposalId' JOIN listing_revisions r ON r.id=p.listing_revision_id JOIN listings l ON l.id=r.listing_id
 WHERE a.id=NEW.approval_id AND a.scope='package' AND a.decision='approved' AND a.created_by=actor_id() AND p.listing_revision_id=NEW.listing_revision_id AND p.digitization_id=NEW.digitization_id AND p.input_revision=NEW.input_revision AND r.status='approved' AND r.reviewed_by=actor_id() AND l.status='published' AND l.version=NEW.listing_version AND l.version=r.base_version+1) THEN RAISE EXCEPTION 'Reviewed current inventory package required' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
CREATE FUNCTION digitization_commit_publication(revision_ref uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p digitization_publication_proposals;q digitization_tour_review_requests;r listing_revisions;l listings;a approval_records;pa approval_records;pkg published_packages;g jsonb;n jsonb;h jsonb;nodes jsonb:='[]';hotspots jsonb;slots jsonb:='{}';slot text;tier text;idx int:=0;ti int;binding uuid;entry text;
BEGIN
 SELECT * INTO p FROM digitization_publication_proposals WHERE listing_revision_id=revision_ref;IF p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO q FROM digitization_tour_review_requests WHERE id=p.tour_review_request_id;
 SELECT * INTO r FROM listing_revisions WHERE id=revision_ref;SELECT * INTO l FROM listings WHERE id=r.listing_id;
 IF q.reviewer_id<>actor_id() OR p.created_by=actor_id() OR NOT digitization_current_tour_reviewer(actor_id()) OR r.status<>'approved' OR r.reviewed_by<>actor_id() OR l.version<>r.base_version+1 OR l.status<>'published' OR NOT digitization_tour_review_current(q.id) THEN RAISE EXCEPTION 'Current independent inventory approval required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM approval_records WHERE id=p.approval_id AND decision='approved';IF a.id IS NULL OR EXISTS(SELECT 1 FROM digitization_approval_invalidations WHERE approval_id=a.id AND input_revision<=p.input_revision) THEN RAISE EXCEPTION 'Tour approval changed' USING ERRCODE='40001';END IF;
 g:=a.snapshot->'manifest';
 FOR n IN SELECT value FROM jsonb_array_elements(g->'nodes') LOOP idx:=idx+1;slots:=slots||jsonb_build_object(n->>'id','node-'||idx);END LOOP;
 entry:=slots->>(g->>'entryNodeId');
 FOR n IN SELECT value FROM jsonb_array_elements(g->'nodes') LOOP
  slot:=slots->>(n->>'id');hotspots:='[]';
  FOR h IN SELECT value FROM jsonb_array_elements(n->'hotspots') LOOP hotspots:=hotspots||jsonb_build_array(jsonb_build_object('targetNode',slots->>(h->>'targetNodeId'),'label',h->>'label','yaw',h->'yaw','pitch',h->'pitch'));END LOOP;
  nodes:=nodes||jsonb_build_array(jsonb_build_object('slot',slot,'label',n->>'label','headingDegrees',n->'headingDegrees','tiers',(SELECT jsonb_agg('tier-'||ordinality) FROM jsonb_array_elements(n->'tierArtifactIds') WITH ORDINALITY),'hotspots',hotspots));
 END LOOP;
 INSERT INTO approval_records(digitization_id,organization_id,created_by,input_revision,scope,snapshot,decision,reason) VALUES(p.digitization_id,p.organization_id,actor_id(),p.input_revision,'package',jsonb_build_object('kind','reviewed_inventory_tour_package','proposalId',p.id,'tourApprovalId',a.id,'listingRevisionId',r.id),'approved',r.review_reason) RETURNING * INTO pa;
 INSERT INTO published_packages(digitization_id,organization_id,created_by,listing_id,listing_version,input_revision,approval_id,manifest,publication_number,listing_revision_id) VALUES(p.digitization_id,p.organization_id,actor_id(),l.id,l.version,p.input_revision,pa.id,jsonb_build_object('schemaVersion',1,'viewerType','panorama','entryNode',entry,'nodes',nodes,'scaleStatus','unscaled','metricMeasurementsAvailable',false,'limitations',jsonb_build_array('Reviewed panorama captures; no metric measurements or scene reconstruction.')),(SELECT coalesce(max(publication_number),0)+1 FROM published_packages WHERE listing_id=l.id),r.id) RETURNING * INTO pkg;
 FOR n IN SELECT value FROM jsonb_array_elements(g->'nodes') LOOP
  ti:=0;FOR binding IN SELECT value::text::uuid FROM jsonb_array_elements_text(n->'tierArtifactIds') LOOP ti:=ti+1;INSERT INTO digitization_public_package_bindings VALUES(pkg.id,slots->>(n->>'id'),'tier-'||ti,binding);END LOOP;
 END LOOP;
 RETURN pkg.id;
END $$;
CREATE FUNCTION digitization_revoke_package(package_ref uuid,expected int,reason_ref text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p published_packages;
BEGIN
 SELECT * INTO p FROM published_packages WHERE id=package_ref;
 IF p.id IS NULL OR expected<>p.version OR NOT digitization_target_access(p.digitization_id) OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor_id() AND state='active') THEN RAISE EXCEPTION 'Current publication authority and version required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM listings WHERE id=p.listing_id FOR UPDATE;
 IF p.id<>(SELECT id FROM published_packages WHERE listing_id=p.listing_id ORDER BY publication_number DESC LIMIT 1) OR EXISTS(SELECT 1 FROM digitization_package_revocations WHERE package_id=p.id) THEN RAISE EXCEPTION 'Current active package required' USING ERRCODE='40001';END IF;
 INSERT INTO digitization_package_revocations(package_id,created_by,package_version,reason) VALUES(p.id,actor_id(),expected,reason_ref);RETURN p.id;
END $$;
CREATE FUNCTION digitization_immutable_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable publication record' USING ERRCODE='23514';END $$;
CREATE TRIGGER binding_immutable BEFORE UPDATE OR DELETE ON digitization_public_package_bindings FOR EACH ROW EXECUTE FUNCTION digitization_immutable_publication();
CREATE TRIGGER revocation_immutable BEFORE UPDATE OR DELETE ON digitization_package_revocations FOR EACH ROW EXECUTE FUNCTION digitization_immutable_publication();
-- Latest first, then eligibility: revocation never falls back to an older package.
-- Current draft edits do not alter the immutable approved snapshot or its grants.
CREATE FUNCTION digitization_public_package(listing_ref uuid,package_ref uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pkg published_packages;p digitization_publication_proposals;q digitization_tour_review_requests;author_roles text[];
BEGIN
 SELECT * INTO pkg FROM published_packages WHERE listing_id=listing_ref ORDER BY publication_number DESC LIMIT 1;
 IF pkg.id IS NULL OR package_ref IS NOT NULL AND package_ref<>pkg.id OR EXISTS(SELECT 1 FROM digitization_package_revocations WHERE package_id=pkg.id) OR NOT EXISTS(SELECT 1 FROM listings WHERE id=listing_ref AND status='published') THEN RETURN NULL;END IF;
 SELECT * INTO p FROM digitization_publication_proposals WHERE listing_revision_id=pkg.listing_revision_id;SELECT * INTO q FROM digitization_tour_review_requests WHERE id=p.tour_review_request_id;
 IF p.id IS NULL OR NOT digitization_actor_target(p.created_by,p.organization_id,p.created_by,'listing',listing_ref,(SELECT unit_id FROM listings WHERE id=listing_ref)) OR NOT EXISTS(SELECT 1 FROM profiles pr JOIN memberships m ON m.user_id=pr.id JOIN organizations o ON o.id=m.organization_id WHERE pr.id=p.created_by AND pr.state='active' AND m.organization_id=p.organization_id AND m.status='active' AND m.role IN('agent','agency_manager') AND o.type='agency') OR NOT EXISTS(SELECT 1 FROM approval_records WHERE id=pkg.approval_id AND decision='approved' AND scope='package') THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(q.sources) s LEFT JOIN media_assets a ON a.id=(s->>'assetId')::uuid WHERE a.id IS NULL OR a.owner_id<>p.created_by OR a.status<>'approved' OR a.visibility<>'private' OR a.scan_at IS NULL OR a.version<>(s->>'assetVersion')::int OR a.size::text IS DISTINCT FROM s->>'bytes' OR a.mime IS DISTINCT FROM s->>'detectedMime') THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM digitization_public_package_bindings b LEFT JOIN artifacts a ON a.id=b.artifact_id JOIN processing_stages st ON st.id=a.stage_id WHERE b.package_id=pkg.id AND (a.status<>'private' OR a.privacy_status NOT IN('pending','passed') OR a.format<>'image/png' OR st.state<>'succeeded' OR a.digitization_id<>pkg.digitization_id OR a.input_revision<>pkg.input_revision)) THEN RETURN NULL;END IF;
 SELECT array_agg(DISTINCT role) INTO author_roles FROM memberships WHERE user_id=p.created_by AND organization_id=p.organization_id AND status='active' AND role IN('agent','agency_manager');
 RETURN jsonb_build_object('packageId',pkg.id,'version',pkg.version,'publicationNumber',pkg.publication_number,'manifest',pkg.manifest,'engineId',pkg.digitization_id,'author',jsonb_build_object('id',p.created_by,'orgId',p.organization_id,'roles',to_jsonb(author_roles)),'sources',q.sources,'inputRevision',pkg.input_revision,'bindings',(SELECT jsonb_agg(jsonb_build_object('nodeSlot',b.node_slot,'tierSlot',b.tier_slot,'artifactId',b.artifact_id)) FROM digitization_public_package_bindings b WHERE b.package_id=pkg.id));
END $$;
