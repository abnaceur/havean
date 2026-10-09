import {forwardDigitizationStream} from '../../../../../../../../digitization-stream';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{listingId:string}>}){const {listingId}=await params;return forwardDigitizationStream(req,`/api/v1/ops/listings/${encodeURIComponent(listingId)}/digitization/events`);}
