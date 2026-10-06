import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.ts'))files.push(file);}}
walk('apps/api/src');
const operations=[];
for(const file of files){
 const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 function visit(node){
  if(ts.isClassDeclaration(node))for(const member of node.members){
   if(!ts.isMethodDeclaration(member)||!member.body)continue;
   const decorator=(ts.getDecorators(member)||[]).find(d=>ts.isCallExpression(d.expression)&&['Get','Post','Patch','Put','Delete'].includes(d.expression.expression.getText(tree)));
   if(!decorator||!ts.isCallExpression(decorator.expression))continue;
   const method=decorator.expression.expression.getText(tree).toUpperCase(),route=decorator.expression.arguments[0]?.text;if(!route)continue;
   const id=node.name.text+'_'+member.name.getText(tree);
   let body='z.undefined()',query='z.object({})';
   function read(n){
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='parse'&&['body','input'].includes(n.arguments[0]?.getText(tree))){
     const schema=n.expression.expression.getText(tree);const parameterNames=(decoratorName)=>member.parameters.filter(parameter=>(ts.getDecorators(parameter)||[]).some(decorator=>ts.isCallExpression(decorator.expression)&&decorator.expression.expression.getText(tree)===decoratorName)).map(parameter=>parameter.name.getText(tree));const argument=n.arguments[0].getText(tree);if(parameterNames('Query').includes(argument))query=schema;else if(parameterNames('Body').includes(argument))body=schema;
    }
    ts.forEachChild(n,read);
   }read(member.body);
   if(['DiscoveryController_market','GeographyController_records'].includes(id))query="z.object({city:z.string().min(1).max(100).optional()})";
   if(id==='DiscoveryController_provider')query="z.object({city:z.string().min(1).max(100).optional()})";
   if(['DiscoveryController_community','DiscoveryController_listing','DiscoveryController_listingAgents','DiscoveryController_development','DiscoveryController_agent'].includes(id))query="z.object({city:z.string().min(1).max(100).optional()})";
   if(id==='DiscoveryController_estimate'){body='mortgageSchema';query="z.object({city:z.string().regex(/^[a-z0-9-]{1,50}$/).default('bj')})";}
   if(id==='MediaController_content')body='z.instanceof(Blob)';
   if(id==='IdentityController_login')query="z.object({returnTo:z.string().optional(),prompt:z.literal('login').optional()})";
   if(id==='IdentityController_callback')query="z.object({code:z.string(),state:z.string()})";
   if(id==='MediaController_content')query="z.object({signature:z.string()})";
   if(id==='MediaController_download')query="z.object({signature:z.string().optional()})";
   operations.push({id,method,path:'/api/v1/'+(node.name.text==='HealthController'?'health/':'')+route,body,query});
  }
  ts.forEachChild(node,visit);
 }visit(tree);
}
operations.sort((a,b)=>a.id.localeCompare(b.id));
let output="// Generated from controller validation schemas; do not edit.\nimport {z} from 'zod';\nimport {money,listingFilters,inquirySchema,ownerSchema} from '../domain';\nimport {rankingFilters,viewSignal,boostCreate,boostUpdate} from '../discovery-ranking';\nimport {notificationPreferenceUpdate,notificationVersion,notificationEventInput,notificationPlanInput} from '../notifications';\nimport {savedSearchCreate,savedSearchUpdate,savedSearchDelete} from '../saved-searches';\nimport {historyVersion,historyPreference,historyView} from '../browsing-history';\nimport {favoriteMutation} from '../favorites';\nimport {rentalTermsUpdate} from '../rental-terms';\nimport {projectCreate,projectUpdate,phaseCreate,phaseUpdate,projectBuildingCreate,projectBuildingUpdate} from '../development-projects';\nimport {floorTypeCreate,floorTypeUpdate,offeredUnitCreate,offeredUnitUpdate} from '../development-inventory';\nimport {developmentFilters,developmentPricing} from '../development-discovery';\nimport {developmentReviewSubmit,developmentReviewDecision,developmentReviewQuery} from '../development-review';\nimport {deletionRequest} from '../account-privacy';\nimport {profileUpdate} from '../account-profile';\nimport {mortgageSchema} from '../mortgage';\nimport {draftCreate,draftUpdate} from '../inventory-drafts';\nimport {agencyInvite,agencyInviteDecision,agencyMembershipUpdate} from '../agency-memberships';\nimport {listingAssignment,leadAssignment} from '../assignments';\nimport {agentDirectoryFilters} from '../agent-directory';\nimport {agentProfileCreate,agentProfileUpdate,agentCredentialSubmit,agentCredentialReview,agentCredentialFilters} from '../agent-credentials';\nimport {ownerPriceChange,ownerLifecycleAction} from '../owner-lifecycle';\nimport {ownerWizardCreate,ownerWizardUpdate,ownerWizardSubmit} from '../owner-wizard';\nimport {inquirySessionCreate,guestInquiry} from '../inquiries';\nimport {leadQueueFilters,leadStageUpdate,leadNoteCreate} from '../crm';\nimport {availabilityUpdate,availabilityBlockCreate,availabilityBlockCancel,viewingSlotQuery} from '../viewing-availability';\nimport {viewingBookingCreate,viewingBookingConfirm,viewingBookingCancel} from '../viewing-bookings';\nimport {viewingCalendarQuery,viewingRescheduleQuery,viewingReschedule,viewingTerminalAction} from '../viewing-calendar';\nimport {leadExportQuery,viewingExportQuery} from '../crm-exports';\nimport {messageCreate,chatUploadIntent,messageHistoryQuery,conversationListQuery,readCursorUpdate} from '../chat';\nimport {providerCreate,providerUpdate,providerVersion,providerReview,providerFilters,providerReviewFilters,providerPage} from '../providers';\nimport {quoteCreate,quoteChange,quoteFilters} from '../quotes';\nimport {managementGrantCreate,managementGrantUpdate,managementGrantPage} from '../management-grants';\nimport {tenantInvite,tenantInviteDecision} from '../tenant-links';\nimport {leaseDraftCreate,leaseDraftUpdate} from '../lease-drafts';\nimport {leaseActivation,leaseRenewal,leaseEnding} from '../lease-workflow';\nimport {chargeGeneration,chargePreviewQuery} from '../recurring-charges';\nimport {paymentEvidenceCreate,paymentEvidenceUpdate,paymentEvidencePost} from '../payment-evidence';\nimport {paymentAllocation,allocationLedgerQuery} from '../payment-allocations';\nimport {financialReversal} from '../financial-reversals';\nimport {depositMovement,depositLedgerQuery} from '../deposits';\nimport {tenantLeaseQuery} from '../tenant-leases';\nimport {managementDashboardQuery} from '../management-dashboard';\nimport {statementQuery} from '../statements';\nimport {maintenanceCreate,maintenanceWorkflow,maintenancePageQuery,maintenanceOptionsQuery,maintenanceTenantAction} from '../maintenance';\nimport {responses} from '../responses';\nimport {propertyMediaMetadata} from '../property-media';\nimport {geographyCreate,geographyUpdate,geographyFilters,marketSettings,geographyKind} from '../geography';\nconst kind=z.enum(['photo','floor_plan','panorama','video']);\nconst metadata=propertyMediaMetadata;\nexport const operations={\n";
for(const op of operations){
 const params=[...op.path.matchAll(/:(\w+)/g)].map(m=>m[1]);const parameterSchema=params.map(p=>JSON.stringify(p)+':'+(p==='kind'?'geographyKind':p==='resource'?"z.enum(['listings','developments'])":'z.string().min(1)')).join(',');
 output+=JSON.stringify(op.id)+':{method:'+JSON.stringify(op.method)+',path:'+JSON.stringify(op.path)+',params:z.object({'+parameterSchema+'}),query:'+op.query+',body:'+op.body+',response:responses['+JSON.stringify(op.id)+']},\n';
}
output+='} as const;\n';
function write(file,source){if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==source)throw Error('Generated contract is stale: '+file);}else fs.writeFileSync(file,source);}
write('packages/contracts/src/generated/operations.ts',output);
const sdk="// Generated from API operations. Uses the canonical session transport.\nimport {operations} from './operations';\nimport {call} from '../transport';\nexport const sdk={\n"+operations.map(op=>JSON.stringify(op.id)+':call(operations['+JSON.stringify(op.id)+'])').join(',\n')+'\n};\n';
write('packages/contracts/src/generated/client.ts',sdk);
console.log('Generated '+operations.length+' typed API operations.');
