ALTER TABLE developments ADD CONSTRAINT development_price_basis CHECK(price_basis IN('per m²','starting total')),
 ADD CONSTRAINT development_price_bounds CHECK((price_min IS NULL AND price_max IS NULL) OR (price_min IS NOT NULL AND price_min>0 AND (price_max IS NULL OR price_max>=price_min)));
