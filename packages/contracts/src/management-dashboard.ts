import {z} from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return v.slice(0,4)!=='0000'&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'Use a real YYYY-MM-DD date');
export const managementDashboardQuery=z.object({date:date.optional()}).strict();
const count=z.number().int().nonnegative(),money=z.string().regex(/^\d+\.\d{2}$/);
export const managementDashboardRecord=z.object({organizationId:z.uuid(),asOf:z.string(),date,timeZone:z.literal('UTC'),occupancy:z.object({units:count,occupied:count,vacant:count,unknownHistory:count}),arrears:z.array(z.object({currency:z.string(),notDue:money,days1to30:money,days31to60:money,days61to90:money,daysOver90:money,total:money,charges:count})),maintenance:z.object({counts:z.array(z.object({status:z.string(),count})),unknownHistory:count}),definitions:z.object({scope:z.string(),occupancy:z.string(),arrears:z.string(),maintenance:z.string()})});
export type ManagementDashboardRecord=z.infer<typeof managementDashboardRecord>;
