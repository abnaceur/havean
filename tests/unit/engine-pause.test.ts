import {expect,it,vi} from 'vitest';
import type pg from 'pg';
import {requireAvailableRevision} from '../../apps/api/src/inventory/engine-pause';

it.each(['digitizationPackage','unitFacts'])('blocks stored %s proposals before any review side effect',async field=>{
 const query=vi.fn().mockResolvedValue({rows:[{changes:{[field]:{engineId:'stored-engine'}}}]});
 await expect(requireAvailableRevision({query} as unknown as pg.PoolClient,'proposal')).rejects.toMatchObject({response:{code:'DIGITIZATION_DISABLED'},status:503});
 expect(query).toHaveBeenCalledTimes(1);
});
it.each([{rows:[{changes:{title:'Normal property revision',price:'2500000.50'}}]},{rows:[]}])('leaves ordinary revision authorization and missing-record handling to their normal workflow',async({rows})=>{
 const query=vi.fn().mockResolvedValue({rows});
 await expect(requireAvailableRevision({query} as unknown as pg.PoolClient,'proposal')).resolves.toBeUndefined();
});
