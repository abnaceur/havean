-- PostgreSQL requires UPDATE privileges for SELECT ... FOR UPDATE.
-- Triggers remain the authority preventing any mutation of posted entries.
GRANT UPDATE ON payments,charges TO haven_app;
