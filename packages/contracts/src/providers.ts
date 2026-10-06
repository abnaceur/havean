import {z} from 'zod';
export const providerCategory=z.enum(['Interior design','Renovation','Kitchen renovation','Bathroom renovation','Painting','Repairs','Landscaping']);
const portfolio=z.object({assetId:z.uuid(),version:z.number().int().positive(),alt:z.string().trim().min(3).max(160),caption:z.string().trim().max(300),rights:z.string().trim().min(5).max(300)}).strict();
const fields={name:z.string().trim().min(2).max(120),description:z.string().trim().min(20).max(3000),city:z.string().regex(/^[a-z0-9-]{1,50}$/),categories:z.array(providerCategory).min(1).max(7),districtIds:z.array(z.uuid()).min(1).max(20),portfolio:z.array(portfolio).max(12)};
export const providerCreate=z.object({version:z.literal(0),...fields}).strict();
export const providerUpdate=z.object({version:z.number().int().positive(),...fields}).strict();
export const providerVersion=z.object({version:z.number().int().positive()}).strict();
export const providerReview=z.object({version:z.number().int().positive(),decision:z.enum(['approved','rejected','revoked']),reason:z.string().trim().min(5).max(1000),verified:z.boolean().default(false)}).strict();
export const providerFilters=z.object({city:z.string().regex(/^[a-z0-9-]{1,50}$/).default('bj'),districtId:z.uuid().optional(),category:providerCategory.optional(),text:z.string().trim().max(120).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const providerReviewFilters=z.object({status:z.enum(['submitted','approved','rejected','revoked']).default('submitted'),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const ownedProvider=z.object({id:z.uuid(),slug:z.string(),name:z.string(),description:z.string(),city:z.string().nullable(),categories:z.array(z.string()),districts:z.array(z.string()),districtIds:z.array(z.uuid()),portfolio:z.array(portfolio),status:z.enum(['draft','submitted','approved','rejected','revoked']),version:z.number().int().positive(),reviewNote:z.string().nullable(),provenance:z.string(),publicUrl:z.string().nullable()});
export const providerReviewRow=ownedProvider.extend({canReview:z.boolean(),organizationName:z.string()});
export const publicProvider=z.object({id:z.uuid(),slug:z.string(),name:z.string(),description:z.string(),categories:z.array(z.string()),districts:z.array(z.string()),photos:z.array(z.string()),version:z.number().int().positive(),city:z.string(),portfolio:z.array(z.object({url:z.string(),alt:z.string(),caption:z.string()}))});
export type ProviderInput=z.input<typeof providerCreate>;

export const providerPage=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
