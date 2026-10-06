import {it,expect} from 'vitest';
import {mortgageSchema} from '../../packages/contracts/src/mortgage';
import {quoteCreate} from '../../packages/contracts/src/quotes';
const mortgage={price:'120000',downPayment:'0',annualRate:'6',years:10,method:'equal_payment'};
const quote={version:0,providerId:'10000000-0000-4000-8000-000000004000',providerVersion:1,city:'bj',districtId:'10000000-0000-4000-8000-000000000020',serviceCategory:'Painting',description:'Synthetic validated quote contact and project description.',contactName:'Synthetic Customer',contactEmail:'customer@example.test',contactPhone:'+86 130 0000 0000',budget:'1000.00',currency:'CNY',consent:true,policyVersion:1};
it('T02 malformed amount strings produce structured validation failures without decimal parsing exceptions',()=>{for(const value of ['broken','1\n','1\r','',' ','-1','NaN','Infinity','1e3','1.234','9'.repeat(300)])for(const field of ['price','downPayment'])expect(mortgageSchema.safeParse({...mortgage,[field]:value}).success).toBe(false);});
it('V03 malformed quote budgets produce structured validation failures while exact valid budgets normalize',()=>{for(const budget of ['broken','1\n','1\r','',' ','-1','NaN','Infinity','1e3','1.234','9'.repeat(300)])expect(quoteCreate.safeParse({...quote,budget}).success).toBe(false);expect(quoteCreate.parse({...quote,budget:'1000.5'}).budget).toBe('1000.50');});
