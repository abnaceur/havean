import {z} from 'zod';
export const digitizationTenantDeletionCreate=z.strictObject({scopeVersion:z.string().regex(/^[a-f0-9]{64}$/),deletionConfirmed:z.literal(true),reason:z.string().trim().min(10).max(1000)});
export const digitizationTenantDeletionReceipt=z.strictObject({id:z.uuid(),organizationId:z.uuid(),version:z.literal(1),state:z.literal('requested'),accessRevoked:z.literal(true),onlineCleanupComplete:z.literal(false),retainedBusinessRecords:z.literal(true)});
export const digitizationTenantDeletionContext=z.strictObject({organizationId:z.uuid(),organizationName:z.string(),scopeVersion:z.string().regex(/^[a-f0-9]{64}$/),workspaceCount:z.number().int().nonnegative(),runCount:z.number().int().nonnegative(),sourceCount:z.number().int().nonnegative(),artifactCount:z.number().int().nonnegative(),request:z.strictObject({id:z.uuid(),version:z.literal(1),state:z.literal('requested'),pendingJobs:z.number().int().nonnegative(),completedJobs:z.number().int().nonnegative(),retainedOriginals:z.number().int().nonnegative()}).nullable()});

export const digitizationTenantDeletionOrganizations=z.array(z.strictObject({id:z.uuid(),name:z.string()})).max(1000);
