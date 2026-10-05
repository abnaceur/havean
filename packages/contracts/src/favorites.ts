import {z} from 'zod';
export const favoriteMutation=z.object({version:z.number().int().nonnegative(),listingVersion:z.number().int().positive().nullable()}).strict();
export const favoriteState=z.object({saved:z.boolean(),version:z.number().int().nonnegative(),listingVersion:z.number().int().positive().nullable()});
