import {forwardDigitizationStream} from '../../../../../../../digitization-stream';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return forwardDigitizationStream(req,`/api/v1/ops/digitization-intakes/${encodeURIComponent(id)}/events`);}
