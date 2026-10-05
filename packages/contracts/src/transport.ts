import {z} from 'zod';
import type {ApiEnvelope} from './domain';
export class ApiError extends Error{
 constructor(readonly code:string,message:string,readonly status:number,readonly requestId:string,readonly fieldErrors:Record<string,string[]>={}){super(message);this.name='ApiError';}
}
export async function api<T>(path:string,init?:RequestInit):Promise<ApiEnvelope<T>>{
 const headers=new Headers(init?.headers),binary=typeof Blob!=='undefined'&&init?.body instanceof Blob;
 if(init?.body&&!binary&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
 const response=await fetch('/api/v1'+path,{...init,headers,cache:'no-store'});
 const isJson=response.headers.get('Content-Type')?.includes('json');
 const result=isJson?await response.json():{data:await response.blob()};
 if(!response.ok)throw new ApiError(result.error?.code||'REQUEST_ERROR',result.error?.message||'Request failed',response.status,result.error?.requestId||response.headers.get('X-Request-Id')||'',result.error?.fieldErrors);
 return result;
}
type Operation={method:string;path:string;params:z.ZodType;query:z.ZodType;body:z.ZodType;response:z.ZodType};
export type Request<O extends Operation>={headers?:HeadersInit;signal?:AbortSignal}&(Record<string,never> extends z.input<O['params']>?{params?:z.input<O['params']>}:{params:z.input<O['params']>})&(Record<string,never> extends z.input<O['query']>?{query?:z.input<O['query']>}:{query:z.input<O['query']>})&(undefined extends z.input<O['body']>?{body?:z.input<O['body']>}:{body:z.input<O['body']>});
export function call<const O extends Operation>(operation:O){return async(request:Request<O>):Promise<ApiEnvelope<z.output<O['response']>>>=>{
 const params=operation.params.parse(request.params||{}) as Record<string,string>,query=operation.query.parse(request.query||{}) as Record<string,unknown>;
 let route=operation.path;for(const [key,value] of Object.entries(params))route=route.replace(':'+key,encodeURIComponent(value));
 const search=new URLSearchParams();for(const [key,value] of Object.entries(query))if(value!==undefined&&value!==null)search.set(key,String(value));
 const body=operation.body.parse(request.body),headers=new Headers(request.headers);
 if(!['GET','HEAD'].includes(operation.method)&&!headers.has('Idempotency-Key'))headers.set('Idempotency-Key',crypto.randomUUID());
 const result=await api<z.output<O['response']>>(route.replace(/^\/api\/v1/,'')+(search.size?'?'+search.toString():''),{method:operation.method,headers,signal:request.signal,...(body!==undefined?{body:body instanceof Blob?body:JSON.stringify(body)}:{})});
 return {...result,data:operation.response.parse(result.data) as z.output<O['response']>};
};}
