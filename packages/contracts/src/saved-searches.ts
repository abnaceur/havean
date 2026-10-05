import {z} from 'zod';
import {listingFilters} from './domain';
export const savedSearchCriteria=z.record(z.string(),z.string().max(740)).superRefine((criteria,context)=>{
 if(!criteria.city)context.addIssue({code:'custom',path:['city'],message:'Choose a city for this search.'});
 for(const key of ['page','cursor','limit'])if(key in criteria)context.addIssue({code:'custom',path:[key],message:'Save search criteria without pagination.'});
 const result=listingFilters.strict().safeParse(criteria);if(!result.success)for(const issue of result.error.issues)context.addIssue({code:'custom',path:issue.path,message:issue.message});
});
export const savedSearchCreate=z.object({name:z.string().trim().min(2,'Enter a search name between 2 and 80 characters.').max(80,'Enter a search name between 2 and 80 characters.'),filters:savedSearchCriteria,cadence:z.enum(['daily','weekly']),version:z.literal(0)}).strict();
export const savedSearchUpdate=savedSearchCreate.omit({version:true}).extend({version:z.number().int().positive(),paused:z.boolean()}).strict();
export const savedSearchDelete=z.object({version:z.number().int().positive()}).strict();
export const savedSearchRecord=z.object({id:z.string().uuid(),name:z.string(),filters:z.record(z.string(),z.string()),cadence:z.enum(['daily','weekly']),version:z.number().int().positive(),criteriaVersion:z.number().int().nonnegative(),paused:z.boolean(),createdAt:z.string(),updatedAt:z.string(),restoreUrl:z.string(),alertEligible:z.boolean()});
