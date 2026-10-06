import {z} from 'zod';
const text=z.string().trim().max(4000).transform(v=>v.normalize('NFC')).refine(v=>!Array.from(v).some(c=>c.charCodeAt(0)<32&&!['\n','\r','\t'].includes(c)),'Unsupported control characters');
export const messageCreate=z.object({version:z.literal(0),conversationVersion:z.number().int().positive(),clientId:z.uuid(),body:text,attachments:z.array(z.object({assetId:z.uuid(),version:z.number().int().positive()}).strict()).max(4).default([])}).strict().refine(v=>v.body.length>0||v.attachments.length>0,'Write a message or attach a file').refine(v=>new Set(v.attachments.map(a=>a.assetId)).size===v.attachments.length,'Duplicate attachment');
export const chatUploadIntent=z.object({version:z.literal(0),conversationVersion:z.number().int().positive(),mime:z.enum(['image/jpeg','image/png','application/pdf']),size:z.number().int().positive().max(20*1024*1024),filename:z.string().trim().min(1).max(120).refine(v=>!Array.from(v).some(c=>c.charCodeAt(0)<32),'Unsupported filename'),rights:z.string().trim().min(5).max(300)}).strict();
export const chatAttachment=z.object({assetId:z.uuid(),version:z.number().int().positive(),filename:z.string(),mime:z.string(),available:z.boolean(),url:z.string().nullable()});
export const chatMessage=z.object({id:z.uuid(),conversation_id:z.uuid(),sender_id:z.uuid(),sequence:z.string().regex(/^[1-9]\d*$/),version:z.number().int().positive(),body:z.string(),created_at:z.string(),attachments:z.array(chatAttachment)});
export type MessageCreateInput=z.input<typeof messageCreate>;
export type ChatMessageRecord=z.infer<typeof chatMessage>;

const sequence=z.string().regex(/^(0|[1-9]\d*)$/).refine(v=>BigInt(v)<=9223372036854775807n,'Sequence is out of range');
export const messageHistoryQuery=z.object({before:sequence.optional(),after:sequence.optional(),limit:z.coerce.number().int().min(1).max(100).default(100)}).strict().refine(v=>!(v.before&&v.after),'Use either before or after');
export const conversationListQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const readCursorUpdate=z.object({version:z.number().int().nonnegative(),sequence}).strict();
export const readCursor=z.object({version:z.number().int().nonnegative(),sequence});
export const conversationSummary=z.object({id:z.uuid(),resource_id:z.uuid(),created_at:z.string(),resource_type:z.string().nullable(),state:z.enum(['legacy','active','closed']),unread_count:sequence,participants:z.array(z.string())});
