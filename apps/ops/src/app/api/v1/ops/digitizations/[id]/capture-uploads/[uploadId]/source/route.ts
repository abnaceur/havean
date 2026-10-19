import {forwardCaptureCompletion} from '../../../../../../../../../digitization-capture-completion';
import {forward} from '../../../../../../../[...path]/route';
import type {NextRequest} from 'next/server';
import {z} from 'zod';
type Route={params:Promise<{id:string;uploadId:string}>};
export async function POST(req:Request,{params}:Route){const {id,uploadId}=await params;if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(uploadId).success)return Response.json({error:{code:'VALIDATION_ERROR',message:'Invalid capture identity'}},{status:422});return forwardCaptureCompletion(req,`/api/v1/ops/digitizations/${id}/capture-uploads/${uploadId}/source`);}
export async function GET(req:NextRequest,{params}:Route){const {id,uploadId}=await params;if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(uploadId).success)return Response.json({error:{code:'VALIDATION_ERROR',message:'Invalid capture identity'}},{status:422});return forward(req,{params:Promise.resolve({path:['v1','ops','digitizations',id,'capture-uploads',uploadId,'source']})});}
