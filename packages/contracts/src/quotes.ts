import {z} from 'zod';
import Decimal from 'decimal.js';
import {providerCategory} from './providers';
const budgetPattern=/^\d{1,13}(\.\d{1,2})?(?![\s\S])/;
const budget=z.string().regex(budgetPattern).refine(v=>!budgetPattern.test(v)||new Decimal(v).lte('1000000000000'),'Budget is too large').transform(v=>new Decimal(v).toFixed(2));
export const quoteCreate=z.object({version:z.literal(0),providerId:z.uuid(),providerVersion:z.number().int().positive(),city:z.string().regex(/^[a-z0-9-]{1,50}$/),districtId:z.uuid(),serviceCategory:providerCategory,description:z.string().trim().min(20).max(3000),contactName:z.string().trim().min(2).max(80),contactEmail:z.email().trim().toLowerCase(),contactPhone:z.string().trim().regex(/^[+()\d .-]+$/).refine(v=>{const n=v.replace(/\D/g,'').length;return n>=7&&n<=15;},'Enter 7–15 phone digits'),budget:budget.nullable(),currency:z.string().regex(/^[A-Z]{3}$/),consent:z.literal(true),policyVersion:z.literal(1)}).strict();
export const quoteChange=z.object({version:z.number().int().positive(),status:z.enum(['assigned','contacted','quoted','closed']),note:z.string().trim().min(5).max(1000)}).strict();
export const quoteFilters=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),status:z.enum(['requested','assigned','contacted','quoted','closed']).optional()}).strict();
export const quoteRecord=z.object({id:z.uuid(),providerId:z.uuid(),providerName:z.string(),providerVersion:z.number().int().nullable(),description:z.string(),budget:z.string().nullable(),currency:z.string().nullable(),city:z.string().nullable(),districtId:z.uuid().nullable(),serviceCategory:z.string().nullable(),contactName:z.string().nullable(),contactEmail:z.string().nullable(),contactPhone:z.string().nullable(),status:z.string(),version:z.number().int(),createdAt:z.string(),historical:z.boolean(),canManage:z.boolean(),activity:z.array(z.object({version:z.number().int(),status:z.string(),note:z.string(),at:z.string()}))});

export type QuoteRecord=z.infer<typeof quoteRecord>;
