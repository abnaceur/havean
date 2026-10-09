import {replyDates} from './platform/reply-dates.js';
import {requestRateAddress} from './platform/rate-address.js';
import {MaintenanceController} from './management/maintenance.js';
import {TenantLeasesController} from './management/tenant-leases.js';
import {DepositsController} from './management/deposits.js';
import {FinancialReversalsController} from './management/financial-reversals.js';
import {DigitizationInventoryController} from './inventory/digitization/inventory-controller.js';
import {DigitizationArtifactController} from './inventory/digitization/artifact-controller.js';
import {DigitizationInputController} from './inventory/digitization/input-controller.js';
import {DigitizationCaptureController} from './inventory/digitization/capture-controller.js';
import {DigitizationController} from './inventory/digitization/controller.js';
import {DigitizationWorkerController} from './inventory/digitization/worker-controller.js';
import {PaymentAllocationsController} from './management/payment-allocations.js';
import {PaymentEvidenceController} from './management/payment-evidence.js';
import {RecurringChargesController} from './management/recurring-charges.js';
import {LeaseLifecycleController} from './management/lease-lifecycle.js';
import {LeaseDraftsController} from './management/lease-drafts.js';
import {TenantLinksController} from './management/tenant-links.js';
import {ProviderCatalogController} from './services/provider-catalog.js';
import {ChatMediaController} from './inventory/chat-media.js';
import {ConversationsController} from './engagement/conversations.js';
import {registerConversationSocket} from './engagement/conversation-socket.js';
import {ViewingReminderWorkerController} from './engagement/viewing-reminders.js';
import {CrmExportsController} from './engagement/crm-exports.js';
import {ViewingCalendarController} from './engagement/viewing-calendar.js';
import {ViewingAvailabilityController} from './engagement/viewing-availability.js';
import {CrmController} from './engagement/crm.js';
import {InquirySessionsController} from './identity/inquiry-sessions.js';
import {GuestInquiriesController} from './engagement/inquiries.js';
import {AgentDashboardController} from './administration/agent-dashboard.js';
import {LeadAssignmentsController} from './engagement/lead-assignments.js';
import {AssignmentDirectoryController} from './inventory/assignments.js';
import {AgencyMembershipsController} from './identity/agency-memberships.js';
import {AgentCredentialsController} from './services/agent-credentials.js';
import {DevelopmentReviewController} from './inventory/development-review.js';
import {DevelopmentPricingController} from './inventory/development-pricing.js';
import {DevelopmentInventoryController} from './inventory/development-inventory.js';
import {DevelopmentProjectsController} from './inventory/development-projects.js';
import {NotificationsController,NotificationWorkerController} from './engagement/notifications.js';
import {SavedSearchController} from './engagement/saved-searches.js';
import {BrowsingHistoryController} from './engagement/browsing-history.js';
import 'reflect-metadata';
import {HomeDiscoveryController} from './geography/home.js';
import {Module,Catch,type ExceptionFilter,type ArgumentsHost,HttpException} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {FastifyAdapter,type NestFastifyApplication} from '@nestjs/platform-fastify';
import {createOpenApi} from '@haven/contracts/openapi';
import {operations} from '@haven/contracts/operations';
import {ZodError} from 'zod';
import {randomUUID} from 'node:crypto';
import type {FastifyReply,FastifyRequest} from 'fastify';
import {Identity,env} from './platform/core.js';
import {RentalTermsController} from './inventory/rental-terms.js';
import {PrivacyController} from './identity/privacy.js';
import {ProfileController} from './identity/profile.js';
import {IdentityController} from './identity/controller.js';
import {GeographyController} from './geography/administration.js';
import {DiscoveryController} from './geography/controller.js';
import {RankingsController} from './geography/rankings.js';
import {RankingBoostsController} from './administration/ranking-boosts.js';
import {DiscoveryEventsController} from './engagement/discovery-events.js';
import {SearchHistoryController} from './engagement/search-history.js';
import {EngagementController} from './engagement/controller.js';
import {DraftInventoryController} from './inventory/drafts.js';
import {InventoryController} from './inventory/controller.js';
import {ManagementController} from './management/controller.js';
import {ManagementGrantsController} from './management/grants.js';
import {ServicesController} from './services/controller.js';
import {AdministrationController} from './administration/controller.js';
import {MediaController} from './inventory/media.js';
import {RichMediaController} from './inventory/rich-media.js';
import {HealthController} from './platform/health.js';
import {logEvent,traceStart,traceEnd} from './platform/observability.js';
@Catch() class Errors implements ExceptionFilter{catch(error:any,host:ArgumentsHost){const response=host.switchToHttp().getResponse<FastifyReply>();const req=host.switchToHttp().getRequest<FastifyRequest>();let status=500,code='INTERNAL_ERROR',message='Something went wrong. Please try again.',fieldErrors;if(error instanceof ZodError){status=req.routeOptions.url?.includes('/digitization')?422:400;code='VALIDATION_ERROR';message='Please check the highlighted fields';fieldErrors=error.flatten().fieldErrors;}else if(error instanceof HttpException||(typeof error?.getStatus==='function'&&typeof error?.getResponse==='function')){status=error.getStatus();const body=error.getResponse() as any;code=body.code||({400:'MALFORMED_REQUEST',401:'AUTH_REQUIRED',403:'FORBIDDEN',404:'NOT_FOUND',413:'PAYLOAD_TOO_LARGE',415:'UNSUPPORTED_MEDIA_TYPE'} as Record<number,string>)[status]||'REQUEST_ERROR';message=body.code?body.message:'Request rejected. Check the request and try again.';}else if(error.code==='INVALID_TRANSITION'){status=409;code=error.code;message='This workflow transition is not allowed';}else if([400,413,415].includes(error.statusCode)){status=error.statusCode;code=status===413?'PAYLOAD_TOO_LARGE':status===415?'UNSUPPORTED_MEDIA_TYPE':'MALFORMED_REQUEST';message=status===413?'Upload or request is too large':status===415?'Unsupported content type':'Malformed request';}else if(['23P01','23505','40001','40P01'].includes(error.code)){status=409;code='CONFLICT';message='This record or time slot conflicts with an existing reservation. Refresh and try again.';}else if(['22P02','23514','23503'].includes(error.code)){status=req.routeOptions.url?.includes('/digitization')?422:400;code='INVALID_DATA';message='Invalid record, amount or related resource';}else if(error.code==='42501'){status=403;code='FORBIDDEN';message='You do not have permission for this record';}if(status===500)logEvent({event:'request.error',requestId:req.id,code:error.code||error.name});response.header('Content-Type','application/json; charset=utf-8');response.removeHeader('Content-Length');response.removeHeader('Content-Range');response.status(status).send({error:{code,message,fieldErrors,requestId:req.id,...(req.routeOptions.url?.includes('/digitization')?{recoverable:[409,413,422,429,503].includes(status)}:{})}});}}
@Module({controllers:[DigitizationInventoryController,DigitizationArtifactController,DigitizationInputController,DigitizationWorkerController,MaintenanceController,TenantLeasesController,DepositsController,FinancialReversalsController,DigitizationController,DigitizationCaptureController,PaymentAllocationsController,PaymentEvidenceController,RecurringChargesController,LeaseLifecycleController,LeaseDraftsController,TenantLinksController,ManagementGrantsController,ProviderCatalogController,ChatMediaController,ConversationsController,ViewingReminderWorkerController,CrmExportsController,ViewingCalendarController,ViewingAvailabilityController,CrmController,InquirySessionsController,GuestInquiriesController,AgentDashboardController,LeadAssignmentsController,AssignmentDirectoryController,AgencyMembershipsController,AgentCredentialsController,DevelopmentReviewController,DevelopmentPricingController,DevelopmentInventoryController,DevelopmentProjectsController,RentalTermsController,PrivacyController,NotificationsController,NotificationWorkerController,SavedSearchController,BrowsingHistoryController,RankingsController,HomeDiscoveryController,RankingBoostsController,DiscoveryEventsController,SearchHistoryController,DraftInventoryController,GeographyController,RichMediaController,MediaController,HealthController,IdentityController,ProfileController,DiscoveryController,EngagementController,InventoryController,ManagementController,ServicesController,AdministrationController],providers:[Identity]}) class AppModule{}
export async function start(){const adapter=new FastifyAdapter({bodyLimit:50*1024*1024,genReqId:()=>randomUUID(),trustProxy:false,logger:false});const server=adapter.getInstance();await registerConversationSocket(server);server.addContentTypeParser(['image/jpeg','image/png','application/pdf','video/mp4','video/webm'],{parseAs:'buffer'},(_req,body,done)=>done(null,body));const rates=new Map<string,{count:number,expires:number}>();server.addHook('onRequest',async(req,reply)=>{traceStart(req);reply.header('X-Request-Id',req.id);reply.header('X-Content-Type-Options','nosniff');if(req.url.includes('/tenant-invitations')||req.url.includes('/conversations')||req.url.includes('/viewing-slots')||req.url.includes('/inquir')||req.url.includes('/guest-inquiries')||req.url.includes('/me')||req.url.includes('/ops')||req.url.includes('/auth')||req.url.includes('/health/metrics'))reply.header('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.headers.origin;if(origin!==env.PUBLIC_WEB_URL&&origin!==env.PUBLIC_OPS_URL){reply.code(403).send({error:{code:'CSRF_REJECTED',message:'Untrusted request origin',requestId:req.id}});return;}}const key=requestRateAddress(req,env.SESSION_KEY,[env.PUBLIC_WEB_URL,env.PUBLIC_OPS_URL])+':'+(req.method==='GET'?'read':'write');let rate=rates.get(key);if(!rate||rate.expires<Date.now()){rate={count:0,expires:Date.now()+60000};rates.set(key,rate);}if(++rate.count>(req.method==='GET'?500:100)){reply.code(429).send({error:{code:'RATE_LIMITED',message:'Too many requests. Please try again in a minute.',requestId:req.id}});}if(rates.size>10000)for(const [k,v] of rates)if(v.expires<Date.now())rates.delete(k);});
 server.addHook('onResponse',async(req,reply)=>{
  const route=req.routeOptions.url||'unmatched';traceEnd(req,route,reply.statusCode);
  const sampled=req.method==='GET'&&reply.statusCode===200&&!req.headers.cookie&&(route==='/api/v1/listings'||route==='/api/v1/listings/:id');
  // Metrics and response correlation cover every request. Sample only successful
  // anonymous public browsing logs; retain all errors, private reads and writes.
  if(!route.startsWith('/api/v1/health')&&(!sampled||parseInt(req.id.slice(0,8),16)%100===0))logEvent({event:'request.completed',requestId:req.id,method:req.method,route,status:reply.statusCode,...(sampled?{sampleRate:'1/100'}:{})});
 });
 server.get('/api/v1/openapi.json',async()=>createOpenApi());
 const contractEntries=new Map(Object.entries(operations).map(entry=>[entry[1].method+' '+entry[1].path,entry]));
 server.addHook('preValidation',async(req)=>{const entry=contractEntries.get(req.method+' '+req.routeOptions.url);if(!entry)return;const op=entry[1];op.params.parse(req.params);op.query.parse(req.query);if(entry[0]!=='MediaController_content'&&!op.body.safeParse(undefined).success)op.body.parse(req.body);});
 // Validate native object replies before Fastify serializes them. Keep the
 // onSend fallback for controllers that explicitly send JSON text.
 const checkedReplies=new WeakSet<object>();
 const responseContract=(req:FastifyRequest,reply:FastifyReply)=>{
  if(reply.statusCode>=300||req.method==='HEAD')return;
  const entry=contractEntries.get(req.method+' '+req.routeOptions.url);
  if(!entry||['MediaController_view','MediaController_video','MediaController_download','ManagementController_statementCSV','ManagementController_statementPrint','AdministrationController_supportAttachment','AdministrationController_supportExport','AdministrationController_analyticsExport','IdentityController_login','IdentityController_callback'].includes(entry[0]))return;
  return entry;
 };
 const checkedResponse=(entry:NonNullable<ReturnType<typeof responseContract>>,req:FastifyRequest,reply:FastifyReply,result:Record<string,unknown>)=>{
  // These public loaders normalize SQL dates before storing a cache snapshot.
  // Validate their complete response schema directly on every request.
  const publicWire=entry[0]==='DiscoveryController_listings'||entry[0]==='DiscoveryController_listing';
  const parsed=entry[1].response.safeParse(publicWire?result.data:replyDates(result.data));
  if(!parsed.success){logEvent({event:'response.contract_error',requestId:req.id,operation:entry[0],fields:parsed.error.issues.map(i=>i.path.join('.'))});reply.code(500);return {error:{code:'INTERNAL_ERROR',message:'Something went wrong. Please try again.',requestId:req.id}};}
  return {...result,data:parsed.data};
 };
 server.addHook('preSerialization',async(req,reply,payload)=>{
  const entry=responseContract(req,reply);if(!entry||!payload||typeof payload!=='object'||Buffer.isBuffer(payload))return payload;
  checkedReplies.add(reply);return checkedResponse(entry,req,reply,payload as Record<string,unknown>);
 });
 server.addHook('onSend',async(req,reply,payload)=>{
  if(checkedReplies.has(reply)||typeof payload!=='string')return payload;
  const entry=responseContract(req,reply);if(!entry)return payload;
  return JSON.stringify(checkedResponse(entry,req,reply,JSON.parse(payload)));
 });
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,adapter,{logger:['error','warn','log']});app.useGlobalFilters(new Errors());app.enableShutdownHooks();await app.listen(env.API_PORT,'0.0.0.0');return app;}
await start();
