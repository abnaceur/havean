-- Residential facts are exposed by the public listing projection.
CREATE TRIGGER public_read_changed AFTER INSERT OR UPDATE OR DELETE ON residential_details FOR EACH STATEMENT EXECUTE FUNCTION record_public_read_revision();
