import {z} from 'zod';
export const deletionRequest=z.object({version:z.number().int().positive(),confirmation:z.literal('DELETE MY ACCOUNT'),reason:z.string().trim().max(500).default('')}).strict();
export const retentionClass=z.object({category:z.string(),handling:z.string()});
export const privacyPolicy=z.object({version:z.literal(1),exportRecordLimit:z.number().int().positive(),classes:z.array(retentionClass)});
export const personalExport=z.object({schemaVersion:z.literal(1),generatedAt:z.string(),profile:z.object({id:z.uuid(),displayName:z.string(),email:z.string(),locale:z.string(),version:z.number().int(),emailVerified:z.boolean().nullable()}),records:z.record(z.string(),z.array(z.record(z.string(),z.json()))),retention:privacyPolicy});
export const deletionReceipt=z.object({requestId:z.uuid(),status:z.literal('requested'),version:z.literal(1),accessRevoked:z.literal(true),retentionPolicyVersion:z.literal(1)});
