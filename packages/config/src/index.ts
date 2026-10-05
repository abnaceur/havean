import { z } from 'zod';
export const environmentSchema = z.object({
 DATABASE_URL:z.string().min(1), SESSION_KEY:z.string().regex(/^[a-f0-9]{64}$/,'Use 32 random bytes encoded as hex'),
 OIDC_ISSUER:z.string().url(), OIDC_INTERNAL_URL:z.string().url(), OIDC_CLIENT_ID:z.string().default('haven-web'),
 PUBLIC_WEB_URL:z.string().url(), PUBLIC_OPS_URL:z.string().url(),
 NODE_ENV:z.enum(['development','production','test']).default('development'),
 MAP_STYLE_URL:z.string().url().refine(v=>{const url=new URL(v);return url.protocol==='https:'&&!url.username&&!url.password;},'Use a public HTTPS style URL without credentials').optional(),MAP_ATTRIBUTION:z.string().min(1).max(1000).optional(),
 API_PORT:z.coerce.number().default(4000), SEARCH_URL:z.string().url().default('http://search:7700'),
 SEARCH_KEY:z.string().min(16), REDIS_URL:z.string().default('redis://cache:6379'),
 S3_ENDPOINT:z.string().url().default('http://storage:8333'), S3_ACCESS_KEY:z.string().min(1),S3_SECRET_KEY:z.string().min(16)
}).superRefine((x,ctx)=>{if(x.NODE_ENV==='production'){for(const key of ['PUBLIC_WEB_URL','PUBLIC_OPS_URL','OIDC_ISSUER'] as const)if(!x[key].startsWith('https://'))ctx.addIssue({code:'custom',path:[key],message:'Production requires HTTPS'});if(!x.MAP_STYLE_URL)ctx.addIssue({code:'custom',path:['MAP_STYLE_URL'],message:'Configure a licensed public map style for production'});if(process.env.DEV_PASSWORD)ctx.addIssue({code:'custom',path:['NODE_ENV'],message:'Remove development persona credentials before production boot'});}});
export function config(){const parsed=environmentSchema.safeParse(process.env);if(!parsed.success)throw new Error('Invalid environment: '+parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '));return parsed.data;}
