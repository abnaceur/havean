import {z} from 'zod';
export const developmentReviewSubmit=z.object({version:z.number().int().positive(),requestedStatus:z.enum(['coming_soon','on_sale']),confirm:z.literal(true)}).strict();
export const developmentReviewDecision=z.object({version:z.number().int().positive(),reviewVersion:z.number().int().positive(),decision:z.enum(['approved','rejected']),reason:z.string().trim().min(5).max(1000),verified:z.literal(true)}).strict();
export const developmentReviewQuery=z.object({page:z.coerce.number().int().min(1).max(1000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
