import {z} from 'zod';
export const sitemapQuery=z.object({page:z.coerce.number().int().min(0).max(10000).default(0)}).strict();
export const sitemapPage=z.object({page:z.number().int().nonnegative(),pages:z.number().int().positive(),entries:z.array(z.object({path:z.string().regex(/^\/[a-z0-9%/_-]+$/),lastModified:z.string().nullable()}))});
