import Decimal from 'decimal.js';
import {z} from 'zod';
const amountPattern=/^\d{1,13}(\.\d{1,2})?(?![\s\S])/;
const money=z.string().regex(amountPattern).refine(v=>!amountPattern.test(v)||new Decimal(v).lte('1000000000000'),'Amount must not exceed 1000000000000');
const annualRate=z.union([z.string().regex(/^\d{1,2}(\.\d{1,6})?(?![\s\S])/),z.number().finite().min(0).max(30)]).transform(String).refine(v=>new Decimal(v).gte(0)&&new Decimal(v).lte(30),'Rate must be between 0 and 30 percent');
export const mortgageSchema=z.object({price:money,downPayment:money,annualRate,years:z.coerce.number().int().min(1).max(40),method:z.enum(['equal_payment','equal_principal'])}).strict().refine(x=>!amountPattern.test(x.price)||!amountPattern.test(x.downPayment)||new Decimal(x.price).gt(x.downPayment),{path:['downPayment'],message:'Down payment must be less than property price; loan principal must be positive'});
const calculatedAmount=z.string().regex(/^\d+\.\d{2}(?![\s\S])/);
export const mortgageCalculation=z.object({principal:calculatedAmount,monthlyPayment:calculatedAmount,finalPayment:calculatedAmount,totalInterest:calculatedAmount,totalRepaid:calculatedAmount,method:z.enum(['equal_payment','equal_principal']),annualRate:z.string(),months:z.number().int().positive(),schedule:z.array(z.object({month:z.number().int().positive(),principal:calculatedAmount,interest:calculatedAmount,payment:calculatedAmount,balance:calculatedAmount})).max(480),assumptions:z.string()});
export const defaultMortgageEstimateNotes='Planning estimate only. Taxes and lender fees are excluded. Contact a lender for actual terms.';
export const mortgageResult=mortgageCalculation.extend({city:z.string(),currency:z.string().regex(/^[A-Z]{3}$/),marketVersion:z.number().int().positive(),estimateNotes:z.string().min(10).max(1000)});
export type MortgageCalculation=z.infer<typeof mortgageCalculation>;
export type MortgageResult=z.infer<typeof mortgageResult>;
export function csvCell(value:unknown){const s=String(value);return '"'+(/^[=+\-@\t\r\n]|^\s+[=+\-@]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}

// Formats the frozen API result; it does not recalculate financial amounts.
export function mortgageCsv(result:MortgageResult,title=''){
 const r=mortgageResult.parse(result),label=z.string().max(120).parse(title);
 const rows:(string|number)[][]=[['Schedule title',label.trim()?label:'Repayment schedule'],['City',r.city],['Currency',r.currency],['Market configuration version',r.marketVersion],['Method',r.method==='equal_payment'?'Equal monthly payments':'Equal principal'],['Nominal annual rate (%)',r.annualRate],['Monthly periods',r.months],['Loan principal',r.principal],['Total interest',r.totalInterest],['Total repaid',r.totalRepaid],['First payment',r.monthlyPayment],['Final payment',r.finalPayment],['Estimate notes',r.estimateNotes],['Assumptions',r.assumptions],[],['Month','Principal ('+r.currency+')','Interest ('+r.currency+')','Payment ('+r.currency+')','Balance ('+r.currency+')'],...r.schedule.map(row=>[row.month,row.principal,row.interest,row.payment,row.balance])];
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
