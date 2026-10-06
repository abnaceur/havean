import {z} from 'zod';
export const viewingBookingCreate=z.object({version:z.literal(0),listingId:z.uuid(),listingVersion:z.number().int().positive(),scheduleVersion:z.number().int().positive(),agentId:z.uuid(),startAt:z.iso.datetime()}).strict();
export const viewingBookingConfirm=z.object({version:z.number().int().positive(),listingVersion:z.number().int().positive(),scheduleVersion:z.number().int().positive()}).strict();
export const viewingBookingCancel=z.object({version:z.number().int().positive()}).strict();
