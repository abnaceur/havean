import {z} from 'zod';
// Unfinished input is private work in progress. Canonical draft rules run on prepare.
const text=z.string().max(5000);
export const propertyAuthoringData=z.object({
 values:z.object({title:text,description:text,transaction:z.enum(['sale','rent']),segment:z.enum(['residential','commercial']),currency:z.string().max(3),price:z.string().max(40),rentPeriod:z.enum(['day','month','year']),furnishing:z.string().max(80),availableFrom:z.string().max(10),features:z.string().max(1700)}).strict(),
 unitId:z.union([z.uuid(),z.literal('')]),newUnit:z.boolean(),
 unit:z.object({communityId:z.union([z.uuid(),z.literal('')]),area:text,beds:text,livingRooms:text,baths:text,orientation:text,floor:text,privateAddress:z.string().max(500)}).strict(),
 commercial:z.object({propertyType:text,grossArea:text,usableArea:text,areaBasis:text,priceBasis:text,fitOut:text,floor:text,parkingSpaces:text,permittedUses:text}).strict(),
 listingVersion:z.number().int().positive().nullable()
}).strict();
export const propertyAuthoringCreate=z.object({listingId:z.uuid().optional(),data:propertyAuthoringData,step:z.number().int().min(0).max(1)}).strict();
export const propertyAuthoringSave=z.object({version:z.number().int().positive(),data:propertyAuthoringData,step:z.number().int().min(0).max(3)}).strict();
export const propertyAuthoringVersion=z.object({version:z.number().int().positive()}).strict();
export const propertyAuthoringRecord=z.object({id:z.uuid(),listing_id:z.uuid().nullable(),data:propertyAuthoringData,step:z.number().int(),version:z.number().int().positive(),status:z.enum(['draft','submitted']),updated_at:z.string()});
export type PropertyAuthoringData=z.infer<typeof propertyAuthoringData>;
export type PropertyAuthoringRecord=z.infer<typeof propertyAuthoringRecord>;
