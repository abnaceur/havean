-- Proposed planning copy, stored in market configuration; no lender or tax facts are inferred.
UPDATE market_config SET data=data||'{"mortgageEstimateNotes":"Planning estimate only. Taxes and lender fees are excluded. Contact a lender for actual terms."}'::jsonb,version=version+1 WHERE NOT data ? 'mortgageEstimateNotes';
