import Decimal from 'decimal.js';
import {z} from 'zod';
const amountPattern=/^\d{1,13}(\.\d{1,2})?(?![\s\S])/;
const money=z.string().regex(amountPattern).refine(v=>!amountPattern.test(v)||new Decimal(v).lte('1000000000000'),'Amount must not exceed 1000000000000');
const annualRate=z.union([z.string().regex(/^\d{1,2}(\.\d{1,6})?(?![\s\S])/),z.number().finite().min(0).max(30)]).transform(String).refine(v=>new Decimal(v).gte(0)&&new Decimal(v).lte(30),'Rate must be between 0 and 30 percent');
export const mortgageSchema=z.object({price:money,downPayment:money,annualRate,years:z.coerce.number().int().min(1).max(40),method:z.enum(['equal_payment','equal_principal'])}).strict().refine(x=>!amountPattern.test(x.price)||!amountPattern.test(x.downPayment)||new Decimal(x.price).gt(x.downPayment),{path:['downPayment'],message:'Down payment must be less than property price; loan principal must be positive'});
const calculatedAmount=z.string().regex(/^\d+\.\d{2}(?![\s\S])/);
export const mortgageResult=z.object({principal:calculatedAmount,monthlyPayment:calculatedAmount,finalPayment:calculatedAmount,totalInterest:calculatedAmount,totalRepaid:calculatedAmount,method:z.enum(['equal_payment','equal_principal']),annualRate:z.string(),months:z.number().int().positive(),schedule:z.array(z.object({month:z.number().int().positive(),principal:calculatedAmount,interest:calculatedAmount,payment:calculatedAmount,balance:calculatedAmount})),assumptions:z.string()});
export type MortgageResult=z.infer<typeof mortgageResult>;
export function csvCell(value:unknown){const s=String(value);return '"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
