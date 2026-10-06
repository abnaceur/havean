-- RETURNING checks the new row before a stable lookup function can see it.
DROP POLICY quote_read ON quotes;
CREATE POLICY quote_read ON quotes FOR SELECT USING(user_id=actor_id() OR quote_vendor(id) OR quote_admin());
