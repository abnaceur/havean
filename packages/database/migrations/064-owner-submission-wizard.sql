ALTER TABLE owner_submissions ADD COLUMN wizard_step integer NOT NULL DEFAULT 0 CHECK(wizard_step BETWEEN 0 AND 4);
