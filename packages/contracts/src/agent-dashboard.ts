import {z} from 'zod';
const count=z.number().int().nonnegative(),id=z.uuid(),text=z.string(),version=z.number().int().positive();
export const agentDashboard=z.object({organizationId:id,scope:z.enum(['assigned','agency']),asOf:text,definitions:z.object({inventory:text,published:text,newLeads:text,upcoming:text}),counts:z.object({inventory:count,published:count,newLeads:count,upcoming:count}),inventory:z.array(z.object({id,title:text,status:text,currency:text,price:text.regex(/^\d+(\.\d+)?$/).nullable(),version})),newLeads:z.array(z.object({id,name:text,status:text,createdAt:text,version})),upcoming:z.array(z.object({id,title:text,startAt:text,endAt:text,status:text,version}))});
export type AgentDashboard= z.infer<typeof agentDashboard>;
