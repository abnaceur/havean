import {canReadAgentCredentialDocument} from '../services/agent-credentials.js';
import type pg from 'pg';
import {event,type Actor} from '@haven/database';
export async function grantReviewEvidence(c:pg.PoolClient,a:Actor,submissionId:string){
 if(!a.roles.some(role=>['admin','moderator'].includes(role)))return;
 const result=await c.query(`INSERT INTO moderation_evidence_grants(reviewer_id,submission_id,expires_at)
 SELECT $1,id,now()+interval '30 minutes' FROM owner_submissions WHERE id=$2 AND status='submitted' AND user_id<>$1
 ON CONFLICT(reviewer_id,submission_id) DO UPDATE SET expires_at=excluded.expires_at
 WHERE moderation_evidence_grants.expires_at<now() RETURNING submission_id`,[a.id,submissionId]);
 if(result.rowCount)await event(c,a,submissionId,'review.evidence_granted');
}
export async function canReadPrivateEvidence(c:pg.PoolClient,a:Actor,id:string,ownerId:string){
 if(ownerId===a.id)return true;
 if(!a.roles.some(role=>['admin','moderator'].includes(role)))return false;
 if(await canReadAgentCredentialDocument(c,a,id,ownerId))return true;
 return Boolean((await c.query(`SELECT 1 FROM moderation_evidence_grants g JOIN owner_submissions s ON s.id=g.submission_id
 WHERE g.reviewer_id=$1 AND g.expires_at>now() AND s.status='submitted' AND s.user_id=$2
 AND coalesce(s.data->'documents','[]'::jsonb) ? $3`,[a.id,ownerId,id])).rowCount);
}
