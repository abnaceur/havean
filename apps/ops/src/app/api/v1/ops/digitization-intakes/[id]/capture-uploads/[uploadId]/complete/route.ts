import {forwardCaptureCompletion} from '../../../../../../../../../digitization-capture-completion';
import {z} from 'zod';
export async function POST(req:Request,{params}:{params:Promise<{id:string;uploadId:string}>}){
 const {id,uploadId}=await params;if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(uploadId).success)return Response.json({error:{code:'VALIDATION_ERROR',message:'Invalid capture identity'}},{status:422});
 return forwardCaptureCompletion(req,`/api/v1/ops/digitization-intakes/${id}/capture-uploads/${uploadId}/complete`);
}
