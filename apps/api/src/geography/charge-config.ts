import type pg from 'pg';
import {fail} from '../platform/core.js';
export async function chargeConfiguration(c:pg.PoolClient,unitId:string,org:string){const config=(await c.query('SELECT management_charge_config($1,$2) AS config',[unitId,org])).rows[0].config;if(!config)fail(404,'Granted property market configuration not found');if(!['calendar_days','full_month'].includes(config.proration)||!Number.isInteger(config.legacyDueDay)||config.legacyDueDay<1||config.legacyDueDay>28)fail(409,'The property market charge policy needs configuration');return config;}
