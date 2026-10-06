import {z} from 'zod';
import {operations} from './generated/operations';
export const errorSchema=z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string(),fieldErrors:z.record(z.string(),z.array(z.string())).optional()})});
export function createOpenApi(){
 const paths:Record<string,Record<string,object>>={};
 for(const [id,op] of Object.entries(operations)){
  const route=op.path.replace(/:(\w+)/g,'{$1}'),binary=['MediaController_view','MediaController_video','MediaController_download','LeaseDraftsController_download'].includes(id),redirect=['IdentityController_login','IdentityController_callback'].includes(id);
  const query=z.toJSONSchema(op.query,{io:'input',target:'openapi-3.0'}),params=z.toJSONSchema(op.params,{io:'input',target:'openapi-3.0'});
  const parameters=[];for(const [location,schema] of [['path',params],['query',query]] as const)for(const [name,value] of Object.entries(schema.properties||{}))parameters.push({name,in:location,required:location==='path'||schema.required?.includes(name)||false,schema:value});
  if(id.startsWith('NotificationWorkerController_'))parameters.push({name:'x-alert-timestamp',in:'header',required:true,schema:{type:'string',pattern:'^[0-9]{13}$'}});
  if(id==='MediaController_video')parameters.push({name:'Range',in:'header',required:false,schema:{type:'string'}});
  const success=redirect?'302':op.method==='POST'&&id!=='IdentityController_logout'?'201':'200';
  const responseSchema=redirect?undefined:binary?{type:'string',format:'binary'}:z.toJSONSchema(z.object({data:op.response,meta:z.record(z.string(),z.json()).optional()}),{target:'openapi-3.0'});
  const responses:Record<string,object>={[success]:{description:redirect?'Identity provider redirect':'Successful response',...(responseSchema?{content:{[binary?(id==='MediaController_video'?'video/mp4':id==='MediaController_view'?'image/webp':'application/pdf'):'application/json']:{schema:responseSchema}}}:{})}};
  if(id==='MediaController_video')responses['206']={description:'Partial video content',content:{'video/mp4':{schema:{type:'string',format:'binary'}}}};
  for(const code of [400,401,403,404,409,413,416,429,500,503])responses[String(code)]={description:'Stable API error',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}};
  const requestBody=id==='MediaController_content'?{required:true,content:Object.fromEntries(['image/jpeg','image/png','application/pdf','video/mp4','video/webm'].map(mime=>[mime,{schema:{type:'string',format:'binary'}}]))}:op.body.safeParse(undefined).success?undefined:{required:true,content:{'application/json':{schema:z.toJSONSchema(op.body,{io:'input',target:'openapi-3.0'})}}};
  paths[route]||={};paths[route][op.method.toLowerCase()]={operationId:id,tags:[id.split('Controller_')[0]],parameters,responses,...(requestBody?{requestBody}:{}),security:id.startsWith('NotificationWorkerController_')?[{serviceHmac:[]}]:(/^DiscoveryController_/.test(id)||['HealthController_live','HealthController_ready','GeographyController_geography','GeographyController_buildings','GeographyController_statistics','GeographyController_listings'].includes(id))||id==='RichMediaController_publicMedia'||redirect||['MediaController_view','MediaController_video'].includes(id)?[]:[{session:[]}]};
 }
 return {openapi:'3.0.3',info:{title:'Haven Real Estate API',version:'1.0.0'},servers:[{url:'/'}],paths,components:{securitySchemes:{serviceHmac:{type:'apiKey',in:'header',name:'x-alert-signature',description:'HMAC SHA-256 of timestamp, method, exact path and canonical JSON body digest using a purpose-derived server key; timestamp expires after 60 seconds.'},session:{type:'apiKey',in:'cookie',name:'haven_session'}},schemas:{ApiError:z.toJSONSchema(errorSchema,{target:'openapi-3.0'})}}};
}
