import '../support/env';
import {it,expect} from 'vitest';
import {pool} from '../../packages/database/src/index';
it('Q06 native runtime keeps canonical geometry and exact NUMERIC while unused FlatGeobuf decoders are denied',async()=>{
 const row=(await pool.query("SELECT ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(116.4,39.9),4326)) AS geometry, '9007199254740993.01'::numeric AS amount")).rows[0];
 expect(JSON.parse(row.geometry)).toEqual({type:'Point',coordinates:[116.4,39.9]});expect(row.amount).toBe('9007199254740993.01');
 const functions=(await pool.query("SELECT p.oid,has_function_privilege(current_user,p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'st_fromflatgeobuf%'")).rows;
 expect(functions.length).toBeGreaterThan(0);expect(functions.every(r=>r.allowed===false)).toBe(true);
 await expect(pool.query("SELECT ST_FromFlatGeobuf(NULL::listings,'\\x'::bytea)")).rejects.toMatchObject({code:'42501'});
});
