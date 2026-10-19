-- Native extraction and later OCR retain independent immutable page receipts.
-- A new execution cannot overwrite the original page preview/tokens; the same
-- receipt still cannot be inserted twice. Existing scope/RLS guards are retained.
ALTER TABLE document_pages DROP CONSTRAINT document_pages_binding_id_page_key;
ALTER TABLE document_pages ADD CONSTRAINT document_pages_binding_page_receipt_key
 UNIQUE NULLS NOT DISTINCT(binding_id,page,preview_artifact_id);
