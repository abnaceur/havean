import {z} from 'zod';
export const profileUpdate=z.object({
 displayName:z.string().trim().min(2,'Enter a display name between 2 and 80 characters.').max(80,'Enter a display name between 2 and 80 characters.').refine(value=>![...value].some(character=>character.codePointAt(0)!<32||character.codePointAt(0)===127),'Remove control characters from your display name.'),
 locale:z.enum(['en-GB','en-US']),version:z.number().int().positive(),
}).strict();
export const accountProfile=z.object({id:z.string().uuid(),displayName:z.string(),email:z.string(),locale:z.string(),version:z.number().int().positive(),emailVerified:z.boolean().nullable(),contactSyncedAt:z.string().nullable(),identityAccountUrl:z.url(),roles:z.array(z.string()),organizationId:z.string().uuid().nullable()});
export type AccountProfile=z.infer<typeof accountProfile>;
