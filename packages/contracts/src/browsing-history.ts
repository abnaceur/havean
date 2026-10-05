import {z} from 'zod';
export const historyVersion=z.object({version:z.number().int().nonnegative()}).strict();
export const historyPreference=historyVersion.extend({enabled:z.boolean()}).strict();
export const historyView=historyVersion.extend({listingVersion:z.number().int().positive()}).strict();
