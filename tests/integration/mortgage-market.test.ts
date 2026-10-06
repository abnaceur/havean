import '../support/env';
import {it,expect} from 'vitest';
import {transaction} from '../../packages/database/src/index';
import {saveMarketPatch} from '../support/market-admin';
import {workerActor} from '../../apps/worker/src/processor';
import {DiscoveryController} from '../../apps/api/src/geography/controller';
const input={price:'120000',downPayment:'0',annualRate:'6',years:10,method:'equal_payment'};
it('T03 API estimates carry actual selected market currency/version/configured notes and reject unknown markets',async()=>{const controller=new DiscoveryController(),before=(await transaction(workerActor,c=>c.query("SELECT data,version FROM market_config WHERE id='bj'"))).rows[0],note='Synthetic market-specific planning note; fees are excluded, not lender approval.';await saveMarketPatch({mortgageEstimateNotes:note});try{const r=(await controller.estimate(input,'bj')).data;expect(r).toMatchObject({city:'bj',currency:'CNY',marketVersion:before.version+1,estimateNotes:note,monthlyPayment:'1332.25'});expect((await controller.estimate(input,'sh')).data.city).toBe('sh');await expect(controller.estimate(input,'not-a-market')).rejects.toMatchObject({status:404});}finally{await saveMarketPatch({mortgageEstimateNotes:before.data.mortgageEstimateNotes});}});
