import {Controller,Get,Req,Param,Inject} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import type pg from 'pg';
import {z} from 'zod';
import type {Actor} from '@haven/database';
import {Identity,transaction,data,fail} from '../platform/core.js';
export async function conversationGrant(c:pg.PoolClient,id:string,lock=false){z.uuid().parse(id);const row=(await c.query('SELECT * FROM conversations WHERE id=$1 AND conversation_scope(id)'+(lock?' FOR UPDATE':''),[id])).rows[0];if(!row)fail(404,'Conversation not found for this account','CONVERSATION_UNAVAILABLE');return row;}
export async function authorizedConversation(a:Actor,id:string){return transaction(a,c=>conversationGrant(c,id));}
@Controller('api/v1')
export class ConversationsController{
 constructor(@Inject(Identity) private readonly identity:Identity){}
 @Get('conversations/:id') async detail(@Req() req:FastifyRequest,@Param('id') id:string){const a=await this.identity.actor(req);return transaction(a,async c=>{const row=await conversationGrant(c,id),members=(await c.query('SELECT cm.user_id,cm.kind,cm.status,p.display_name FROM conversation_members cm JOIN profiles p ON p.id=cm.user_id WHERE cm.conversation_id=$1 AND cm.status=\'active\' ORDER BY cm.kind,cm.user_id',[id])).rows;return data({...row,members});});}
}
