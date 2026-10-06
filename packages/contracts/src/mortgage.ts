import Decimal from 'decimal.js';
import {z} from 'zod';
const money=z.string().regex(/^\d{1,13}(\.\d{1,2})?$/).refine(v=>new Decimal(v).lte('1000000000000'),'Amount must not exceed 1000000000000');
const annualRate=z.union([z.string().regex(/^\d{1,2}(\.\d{1,6})?$/),z.number().finite().min(0).max(30)]).transform(String).refine(v=>new Decimal(v).gte(0)&&new Decimal(v).lte(30),'Rate must be between 0 and 30 percent');
export const mortgageSchema=z.object({price:money,downPayment:money,annualRate,years:z.coerce.number().int().min(1).max(40),method:z.enum(['equal_payment','equal_principal'])}).strict().refine(x=>new Decimal(x.price).gt(x.downPayment),{path:['downPayment'],message:'Down payment must be less than property price; loan principal must be positive'});
export const mortgageResult=z.object({principal:z.string(),monthlyPayment:z.string(),finalPayment:z.string(),totalInterest:z.string(),totalRepaid:z.string(),method:z.enum(['equal_payment','equal_principal']),annualRate:z.string(),months:z.number().int().positive(),schedule:z.array(z.object({month:z.number().int().positive(),principal:z.string(),interest:z.string(),payment:z.string(),balance:z.string()})),assumptions:z.string()});
export type MortgageResult=z.infer<typeof mortgageResult>;
export function csvCell(value:unknown){const s=String(value);return '"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
