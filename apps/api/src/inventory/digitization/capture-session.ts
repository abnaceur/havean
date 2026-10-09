import type pg from 'pg';
import {event,type Actor} from '@haven/database';
import {z} from 'zod';
import {digitizationCaptureSessionSave} from '@haven/contracts';
import {fail} from '../../platform/core.js';
import {checkedWorkspace,requireDigitizationAgency} from './intakes.js';
const columns=`id,digitization_id AS "digitizationId",version,input_revision AS "inputRevision",room_checklist AS rooms,clips,active_room_id AS "activeRoomId",state`;
async function scope(c:pg.PoolClient,a:Actor,engine:string){await requireDigitizationAgency(c,a);return checkedWorkspace(c,engine);}
export async function readCaptureSession(c:pg.PoolClient,a:Actor,engine:string){const workspace=await scope(c,a,engine),row=(await c.query(`SELECT ${columns} FROM capture_sessions WHERE digitization_id=$1 AND created_by=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,[engine,a.id])).rows[0];return row?{...row,stale:row.inputRevision!==workspace.inputRevision}:null;}
export async function createCaptureSession(c:pg.PoolClient,a:Actor,engine:string,version:number){
 const workspace=await scope(c,a,engine);if(workspace.version!==version||workspace.state!=='active')fail(409,'Workspace changed. Reload before starting capture.','VERSION_CONFLICT');
 const existing=(await c.query(`SELECT ${columns} FROM capture_sessions WHERE digitization_id=$1 AND created_by=$2 AND state IN('draft','recording')`,[engine,a.id])).rows[0];if(existing){if(existing.inputRevision!==workspace.inputRevision)fail(409,'The previous capture belongs to superseded inputs.','INPUT_REVISION_CHANGED');return {...existing,stale:false};}
 const row=(await c.query(`INSERT INTO capture_sessions(digitization_id,organization_id,created_by,input_revision) VALUES($1,$2,$3,$4) RETURNING ${columns}`,[engine,a.orgId,a.id,workspace.inputRevision])).rows[0];await event(c,a,engine,'digitization.capture_session_created',{captureSessionId:row.id,version:row.version});return {...row,stale:false};
}
export async function saveCaptureSession(c:pg.PoolClient,a:Actor,engine:string,id:string,x:z.infer<typeof digitizationCaptureSessionSave>){
 const workspace=await scope(c,a,engine),row=(await c.query(`SELECT ${columns} FROM capture_sessions WHERE id=$1 AND digitization_id=$2 AND created_by=$3 FOR UPDATE`,[id,engine,a.id])).rows[0];if(!row)fail(404,'Private capture session not found');
 if(row.version!==x.version||row.inputRevision!==x.inputRevision||workspace.inputRevision!==x.inputRevision&&x.state!=='cancelled')fail(409,'Capture or inputs changed. Reload before saving.','VERSION_CONFLICT');if(workspace.state!=='active'||!['draft','recording'].includes(row.state))fail(409,'Capture session is closed.','WORKFLOW_CONFLICT');
 if(x.state==='cancelled'&&(JSON.stringify(x.rooms)!==JSON.stringify(row.rooms)||JSON.stringify(x.clips)!==JSON.stringify(row.clips)||x.activeRoomId!==row.activeRoomId))fail(422,'Cancellation cannot edit the saved checklist.','CAPTURE_CHECKLIST_INVALID');
 const roomIds=new Set(x.rooms.map(r=>r.id));if(roomIds.size!==x.rooms.length||new Set(x.clips.map(clip=>clip.uploadId)).size!==x.clips.length||x.activeRoomId&&!roomIds.has(x.activeRoomId)||x.clips.some(clip=>!roomIds.has(clip.roomId)))fail(422,'Use distinct rooms and room-linked clips.','CAPTURE_CHECKLIST_INVALID');
 const uploads=(await c.query('SELECT id,state FROM digitization_capture_uploads WHERE id=ANY($1::uuid[]) AND digitization_id=$2 AND created_by=$3 FOR SHARE',[x.clips.map(clip=>clip.uploadId),engine,a.id])).rows;
 if(x.state!=='cancelled'&&(uploads.length!==x.clips.length||uploads.some(u=>!['uploading','complete'].includes(u.state))))fail(422,'Select your current uploads from this workspace.','CAPTURE_CLIP_INVALID');
 if(x.state==='complete'&&(!x.rooms.length||x.rooms.some(r=>!r.completed)||uploads.some(u=>u.state!=='complete')))fail(422,'Complete the checklist and uploads before closing capture.','CAPTURE_INCOMPLETE');
 const saved=(await c.query(`UPDATE capture_sessions SET room_checklist=$2,clips=$3,active_room_id=$4,state=$5,version=version+1 WHERE id=$1 RETURNING ${columns}`,[id,JSON.stringify(x.rooms),JSON.stringify(x.clips),x.activeRoomId,x.state])).rows[0];await event(c,a,engine,'digitization.capture_session_saved',{captureSessionId:id,version:saved.version});return {...saved,stale:saved.inputRevision!==workspace.inputRevision};
}
