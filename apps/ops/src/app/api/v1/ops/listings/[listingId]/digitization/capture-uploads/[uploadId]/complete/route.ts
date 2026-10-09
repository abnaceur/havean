import {forwardCaptureCompletion} from '../../../../../../../../../../digitization-capture-completion';
import {z} from 'zod';
export async function POST(req:Request,{params}:{params:Promise<{listingId:string;uploadId:string}>}){
 const {listingId,uploadId}=await params;if(!z.uuid().safeParse(listingId).success||!z.uuid().safeParse(uploadId).success)return Response.json({error:{code:'VALIDATION_ERROR',message:'Invalid capture identity'}},{status:422});
 return forwardCaptureCompletion(req,`/api/v1/ops/listings/${listingId}/digitization/capture-uploads/${uploadId}/complete`);
}
