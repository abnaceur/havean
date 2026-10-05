import {commercialRecord} from './commercial';
import {rentalTermsRecord} from './rental-terms';
import {privacyPolicy,personalExport,deletionReceipt} from './account-privacy';
import {notificationPreferences,notificationRecord,alertSummary} from './notifications';
import {savedSearchRecord} from './saved-searches';
import {favoriteState} from './favorites';
import {accountProfile} from './account-profile';
import {z} from 'zod';
import {pricePreset} from './geography';
import {models as m} from './generated/models';
import {floorLayout,propertyMediaMetadata} from './property-media';
import {ownerSchema} from './domain';
const s=z.string(),uuid=s.uuid(),n=z.number(),bool=z.boolean(),decimal=s.regex(/^-?\d+(\.\d+)?$/),status=z.object({id:uuid,status:s}),versioned=status.extend({version:n});
const owner=m.owner_submissions.extend({data:ownerSchema.extend({photos:z.array(uuid).optional(),documents:z.array(uuid).optional(),reviewReason:s.optional()})});
export const publicListing=m.public_listings.extend({propertyType:z.enum(['office','retail','warehouse']).nullable(),areaBasis:z.enum(['gross','usable']).nullable(),priceBasis:z.enum(['total','per_area']).nullable(),rentalMode:z.enum(['entire','shared']).nullable(),transaction:z.enum(['sale','rent']),segment:z.enum(['residential','commercial']),rankingScore:n.optional(),viewCount:n.optional(),sponsored:bool.optional(),curationLabel:s.nullable().optional()});
export const publicRentalTerms=z.object({mode:z.enum(['entire','shared']).nullable(),billingPeriod:z.enum(['day','month','year']).nullable(),depositAmount:decimal.nullable(),currency:s.nullable(),minimumMonths:n.int().nullable(),utilities:z.array(s),moveInDate:s.nullable(),roomAttributes:z.array(s),unitKind:z.enum(['property','room']),roomLabel:s.nullable()});
export type PublicRentalTerms=z.infer<typeof publicRentalTerms>;
const unavailableProperty=z.object({id:uuid,available:z.literal(false),title:s});
export const savedProperty=z.union([publicListing.extend({available:z.literal(true)}),unavailableProperty]);
export const historyCollection=z.object({enabled:bool,version:n.int().nonnegative(),entries:z.array(z.object({listing:savedProperty,viewedAt:s}))});
const community=z.object({id:uuid,slug:s,name:s,address:s,builtYear:n.nullable(),amenities:z.array(s),photos:z.array(s),district:s,districtId:uuid,city:s,latitude:n.nullable(),longitude:n.nullable()});
const agent=z.object({id:uuid,name:s,slug:s,biography:s,languages:z.array(s),districts:z.array(s),verifiedUntil:s.nullable(),photo:s.nullable(),publicEmail:s.nullable()});
const development=m.developments.omit({organization_id:true}).extend({community:s,district:s,sponsored:bool.optional(),curationLabel:s.nullable().optional()});
const recommendedDevelopment=development.omit({community_id:true,version:true}).extend({rankingScore:n,sponsored:bool,curationLabel:s.nullable()});
const provider=m.providers.omit({organization_id:true,status:true});
const message=m.messages.pick({id:true,sender_id:true,sequence:true,body:true,created_at:true});
const leaseSummary=m.leases.pick({id:true,start_date:true,end_date:true,rent:true,currency:true,status:true}).extend({community:s});
const chargeSummary=m.charges.pick({id:true,period:true,due_date:true,amount:true,currency:true,kind:true,reverses_id:true});
const paymentSummary=m.payments.pick({id:true,amount:true,currency:true,source:true,reference:true,reverses_id:true,created_at:true});
const allocationSummary=m.allocations.pick({id:true,payment_id:true,charge_id:true,amount:true,reversed_at:true});
const depositSummary=m.deposits.pick({id:true,kind:true,amount:true,currency:true,reason:true,created_at:true});
const mediaMetadata=propertyMediaMetadata;
const studioMedia=m.listing_media.extend({metadata:mediaMetadata,pending_metadata:mediaMetadata.nullable(),purpose:s,width:n.nullable(),height:n.nullable(),duration:decimal.nullable(),rights:s,scan_at:s.nullable()});
const publicMedia=z.object({id:uuid,kind:z.enum(['photo','floor_plan','panorama','video']),title:s,position:n,floorPlanId:uuid.nullable(),url:s,poster:s.nullable(),width:n.nullable(),height:n.nullable(),duration:decimal.nullable(),caption:s,spatial:floorLayout.safeExtend({rooms:z.array(floorLayout.shape.rooms.element)}).nullable(),hotspots:mediaMetadata.shape.hotspots});
const geographyRecord=z.union([m.transit_stations,m.communities.extend({latitude:n.nullable(),longitude:n.nullable()}),m.buildings,m.neighborhoods,m.cities,m.districts,m.transit_lines]);
const market=z.object({name:s,currency:s,timezone:s,areaUnit:s,annualRate:decimal,rentPeriod:s,supportEmail:s,demo:bool,pricePresets:z.array(pricePreset).default([])});
const support=m.support_cases.omit({user_id:true,internal_note:true});
const inventoryStatistic=z.object({count:n,pricedCount:n,medianPrice:decimal.nullable(),currency:s});
const inventoryActions=z.object({can_edit:bool,can_media:bool,allowed_transitions:z.array(s)});
const draft=m.listings.pick({id:true,unit_id:true,organization_id:true,owner_id:true,agent_id:true,title:true,description:true,transaction:true,segment:true,currency:true,price:true,rent_period:true,furnishing:true,available_from:true,features:true,status:true,version:true,slug:true});
export const responses={
 DevelopmentReviewController_read:z.object({project:m.developments,review:m.development_publication}),DevelopmentReviewController_submit:z.object({project:m.developments,review:m.development_publication}),DevelopmentReviewController_decision:z.object({project:m.developments,review:m.development_publication}),DevelopmentReviewController_queue:z.array(m.developments.extend({review:m.development_publication})),DevelopmentReviewController_detail:z.object({project:m.developments,review:m.development_publication,types:z.array(m.floor_plans),phases:z.array(m.development_phases)}),DevelopmentReviewController_leads:z.array(m.leads.extend({type_name:s.nullable(),project_name:s})),
 DevelopmentPricingController_update:m.developments,
 DevelopmentInventoryController_units:z.array(m.development_offered_units.extend({area:decimal,building_id:uuid,building:s,floor_plan_name:s})),DevelopmentInventoryController_createType:m.floor_plans.extend({projectVersion:n}),DevelopmentInventoryController_updateType:m.floor_plans.extend({projectVersion:n}),DevelopmentInventoryController_createUnit:m.development_offered_units.extend({projectVersion:n}),DevelopmentInventoryController_updateUnit:m.development_offered_units.extend({projectVersion:n}),
 DevelopmentProjectsController_create:m.developments,DevelopmentProjectsController_update:m.developments,DevelopmentProjectsController_structure:z.object({project:m.developments,phases:z.array(m.development_phases),buildings:z.array(m.buildings)}),DevelopmentProjectsController_createPhase:m.development_phases.extend({projectVersion:n}),DevelopmentProjectsController_updatePhase:m.development_phases.extend({projectVersion:n}),DevelopmentProjectsController_createBuilding:m.buildings.extend({projectVersion:n}),DevelopmentProjectsController_updateBuilding:m.buildings.extend({projectVersion:n}),
 RentalTermsController_read:rentalTermsRecord,RentalTermsController_update:rentalTermsRecord,
 PrivacyController_policy:privacyPolicy,PrivacyController_export:personalExport,PrivacyController_requestDeletion:deletionReceipt,
 NotificationsController_preferences:notificationPreferences,NotificationsController_update:notificationPreferences,NotificationsController_read:z.array(notificationRecord),NotificationsController_markRead:z.object({read:bool}),NotificationsController_deliveries:z.array(alertSummary),NotificationsController_retry:alertSummary,NotificationWorkerController_transactional:z.object({accepted:bool}),NotificationWorkerController_plan:z.object({planned:n.int(),replayed:bool}),NotificationWorkerController_due:z.array(alertSummary),NotificationWorkerController_read:alertSummary,NotificationWorkerController_deliver:alertSummary,
 SavedSearchController_read:z.array(savedSearchRecord),SavedSearchController_create:savedSearchRecord,SavedSearchController_update:savedSearchRecord,SavedSearchController_remove:z.object({deleted:bool,version:n.int().positive()}),SavedSearchController_matches:z.object({eligible:bool,reason:s.nullable(),listings:z.array(z.object({id:uuid,slug:s,title:s,city:s,currency:s,price:decimal.nullable(),version:n.int().positive()}))}),
 BrowsingHistoryController_read:historyCollection,BrowsingHistoryController_preferences:historyCollection,BrowsingHistoryController_record:historyCollection,BrowsingHistoryController_remove:historyCollection,BrowsingHistoryController_clear:historyCollection,
 DiscoveryEventsController_view:z.object({recorded:bool,counted:bool}),
 RankingBoostsController_read:z.array(m.curated_boosts),RankingBoostsController_create:m.curated_boosts,RankingBoostsController_update:m.curated_boosts,
 RankingsController_rankings:z.array(publicListing),RankingsController_recommendations:z.array(publicListing),RankingsController_developments:z.array(recommendedDevelopment),
 HomeDiscoveryController_home:z.object({resale:z.array(publicListing),rentals:z.array(publicListing),developments:z.array(recommendedDevelopment.extend({city:s})),curatedResale:z.array(publicListing),curatedDevelopments:z.array(recommendedDevelopment.extend({city:s}))}),
 SearchHistoryController_read:z.array(z.object({id:uuid,city:s,query:s,version:n,updated_at:s})),SearchHistoryController_record:z.object({id:uuid,city:s,query:s,version:n,updated_at:s}),SearchHistoryController_clear:z.object({cleared:bool}),
 DraftInventoryController_units:z.array(z.object({id:uuid,area:decimal,beds:n,floor:n,community:s,unit_kind:z.enum(['property','room']),parent_unit_id:uuid.nullable(),room_label:s.nullable(),version:n.int().positive()})),DraftInventoryController_owned:z.array(draft),DraftInventoryController_read:draft.extend({commercial:commercialRecord.nullable()}),DraftInventoryController_create:draft.extend({commercial:commercialRecord.nullable()}),DraftInventoryController_update:draft.extend({commercial:commercialRecord.nullable()}),
 GeographyController_statistics:z.object({sale:inventoryStatistic,rent:inventoryStatistic,asOf:s,definition:s}),GeographyController_listings:z.array(publicListing),
 GeographyController_geography:z.object({city:m.cities,districts:z.array(m.districts),neighborhoods:z.array(m.neighborhoods),lines:z.array(m.transit_lines),stations:z.array(m.transit_stations)}),
 GeographyController_records:z.array(geographyRecord),GeographyController_create:geographyRecord,GeographyController_update:geographyRecord,GeographyController_archive:geographyRecord,GeographyController_market:z.object({data:market,version:n}),GeographyController_buildings:z.array(m.buildings.pick({id:true,slug:true,name:true,floors:true,completed_year:true})),
 HealthController_live:z.object({status:s}),HealthController_ready:z.object({status:s,database:s,migrations:s}),
 HealthController_metrics:z.object({requests:z.array(z.object({route:s,count:n,failures:n,averageDurationMs:n})),outbox:z.object({pending:n,processed:n,oldestPendingSeconds:n,dispatchAttempts:n}),queue:z.record(s,n).nullable(),search:z.object({staleListings:n,oldestStaleSeconds:n,pendingEvents:n,oldestPendingSeconds:n,providerAvailable:bool,indexedDocuments:n.nullable(),schemaVersion:n})}),
 IdentityController_login:s,IdentityController_callback:s,IdentityController_logout:z.object({signedOut:bool}),
 IdentityController_me:accountProfile,ProfileController_update:accountProfile,
 DiscoveryController_cities:z.array(m.cities),DiscoveryController_districts:z.array(m.districts),DiscoveryController_market:z.object({data:market,version:n}),
 DiscoveryController_mapConfiguration:z.object({style:s.url().nullable(),attribution:s}),DiscoveryController_mapListings:z.array(publicListing.pick({id:true,slug:true,title:true,transaction:true,segment:true,price:true,currency:true,rentPeriod:true,area:true,beds:true,livingRooms:true,community:true,district:true,city:true,latitude:true,longitude:true,sponsored:true,curationLabel:true}).extend({latitude:n,longitude:n})),
 DiscoveryController_facets:z.object({finishing:z.array(s),heating:z.array(s),furnishing:z.array(s),buildingType:z.array(s),features:z.array(s),ownership:z.array(s),holdingPeriod:z.array(s)}),DiscoveryController_listings:z.array(publicListing),DiscoveryController_listing:publicListing.extend({rentalTerms:publicRentalTerms.nullable()}),DiscoveryController_similar:z.array(publicListing),
 DiscoveryController_suggestions:z.array(z.object({id:uuid,name:s,slug:s,kind:z.enum(['community','district','neighborhood']),city:s})),DiscoveryController_communities:z.array(community),DiscoveryController_community:community,
 DiscoveryController_listingAgents:z.array(agent),DiscoveryController_agents:z.array(agent),DiscoveryController_agent:agent,DiscoveryController_developments:z.array(development.extend({availableTypes:n.int().nonnegative()})),
 DiscoveryController_development:development.extend({latitude:n.nullable(),longitude:n.nullable(),floorPlans:z.array(m.floor_plans),phases:z.array(z.object({id:uuid,name:s,status:z.enum(['coming_soon','on_sale','sold_out'])}))}),
 DiscoveryController_providers:z.array(provider),DiscoveryController_provider:provider,
 DiscoveryController_estimate:z.object({principal:decimal,monthlyPayment:decimal,totalInterest:decimal,totalRepaid:decimal,schedule:z.array(z.object({month:n,principal:decimal,interest:decimal,payment:decimal,balance:decimal})),assumptions:s}),
 EngagementController_favorites:z.array(savedProperty),EngagementController_favoriteState:favoriteState,EngagementController_favorite:favoriteState,EngagementController_unfavorite:favoriteState,
 EngagementController_inquiry:status.extend({created_at:s,conversationId:uuid}),EngagementController_inquiries:z.array(m.leads.pick({id:true,resource_id:true,status:true,created_at:true,message:true})),
 EngagementController_leads:z.array(m.leads),EngagementController_lead:m.leads,
 EngagementController_viewings:z.array(m.viewings.extend({title:s})),EngagementController_opsViewings:z.array(m.viewings.extend({title:s})),EngagementController_book:m.viewings,EngagementController_cancel:m.viewings,EngagementController_confirm:m.viewings,
 EngagementController_conversations:z.array(m.conversations.pick({id:true,resource_id:true,created_at:true})),EngagementController_messages:z.array(message),EngagementController_message:message,
 InventoryController_submissions:z.array(owner),InventoryController_submit:owner,InventoryController_sendDraft:status,
 InventoryController_listings:z.array(m.listings.pick({id:true,title:true,slug:true,status:true,transaction:true,segment:true,price:true,currency:true,rent_period:true,version:true}).extend({community:s,city:s,...inventoryActions.shape})),InventoryController_workbench:m.listings.extend({area:decimal,beds:n,living_rooms:n,baths:n,floor:n,community:s,city:s,...inventoryActions.shape}),InventoryController_scheduleExpiration:versioned.extend({expires_at:s.nullable()}),InventoryController_updateStatus:versioned,
 InventoryController_revise:z.union([status,versioned.extend({title:s,price:decimal.nullable()})]),
 InventoryController_reviews:z.object({listings:z.array(m.listings.pick({id:true,title:true,description:true,status:true,price:true,currency:true,version:true,photos:true}).extend({area:decimal,beds:n,community:s})),submissions:z.array(owner.pick({id:true,user_id:true,data:true,status:true,version:true})),revisions:z.array(m.listing_revisions.pick({id:true,listing_id:true,changes:true,status:true,version:true,base_version:true}).extend({title:s}))}),
 InventoryController_approveRevision:z.object({approved:bool}),InventoryController_rejectRevision:z.object({approved:bool}),InventoryController_publicHistory:z.object({prices:z.array(z.object({id:uuid,previous_price:decimal.nullable(),next_price:decimal,currency:s,created_at:s,reason:s})),statuses:z.array(z.object({id:uuid,status:s,created_at:s}))}),InventoryController_review:z.union([z.object({status:s,listingId:uuid,slug:s}),z.object({status:s})]),
 InventoryController_plans:z.array(m.floor_plans.extend({development_version:n})),InventoryController_editDevelopment:versioned,
 InventoryController_editPlan:m.floor_plans.pick({id:true,development_id:true,available:true}),InventoryController_assign:z.object({id:uuid,version:n}),InventoryController_developments:z.array(m.developments),
 RichMediaController_publicMedia:z.array(publicMedia),RichMediaController_owned:z.array(m.listings.pick({id:true,title:true,slug:true,version:true,status:true})),
 RichMediaController_workbench:z.object({listing:z.object({id:uuid,title:s,version:n,status:s}),media:z.array(studioMedia),floorPlans:z.array(m.floor_plans.pick({id:true,name:true}))}),
 RichMediaController_attach:m.listing_media,RichMediaController_revise:m.listing_media,RichMediaController_reviews:z.array(m.listing_media.extend({property_title:s,rights:s,scan_at:s.nullable()})),RichMediaController_review:versioned,RichMediaController_remove:z.object({removed:bool}),
 MediaController_intent:z.object({id:uuid,uploadUrl:s,method:z.literal('PUT'),expiresIn:n}),MediaController_status:m.media_assets.pick({id:true,status:true,purpose:true,width:true,height:true,duration:true,scan_at:true}),
 MediaController_content:z.object({id:uuid,status:s,visibility:s,purpose:s}),
 MediaController_view:z.instanceof(Blob),MediaController_video:z.instanceof(Blob),MediaController_download:z.instanceof(Blob),MediaController_downloadLink:z.object({url:s,expiresIn:n}),MediaController_attach:z.object({attached:bool}),
 ManagementController_properties:z.array(m.management_grants.pick({id:true,unit_id:true,expires_at:true}).extend({area:decimal,beds:n,community:s})),ManagementController_tenants:z.array(m.tenants.pick({id:true,name:true,email:true,user_id:true})),
 ManagementController_leases:z.array(m.leases.extend({tenant:s,community:s})),ManagementController_createLease:m.leases,ManagementController_activate:m.leases,ManagementController_end:z.object({status:s}),ManagementController_renew:m.leases,
 ManagementController_reverseCharge:m.charges,ManagementController_ownerLeases:z.array(leaseSummary),ManagementController_generate:z.object({generated:n,period:s,proration:s}),ManagementController_charges:z.array(m.charges.extend({community:s})),
 ManagementController_payments:z.array(m.payments),ManagementController_payment:m.payments,ManagementController_allocate:m.allocations,ManagementController_reverse:m.payments,ManagementController_deposit:m.deposits,
 ManagementController_tenantLeases:z.array(leaseSummary),ManagementController_tenantCharges:z.array(chargeSummary.extend({lease_id:uuid})),
 ManagementController_statement:z.object({lease:z.object({id:uuid,currency:s,rent:decimal,startDate:s,endDate:s,status:s}),charges:z.array(chargeSummary),payments:z.array(paymentSummary),allocations:z.array(allocationSummary),deposits:z.array(depositSummary),totals:z.object({charges:decimal,recordedPayments:decimal,allocated:decimal,outstanding:decimal,credit:decimal,depositHeld:decimal}),note:s}),
 ManagementController_tenantMaintenance:z.array(m.maintenance.omit({organization_id:true,user_id:true,internal_note:true})),ManagementController_request:status,ManagementController_maintenance:z.array(m.maintenance),ManagementController_maintain:versioned,
 ServicesController_quote:status,ServicesController_quotes:z.array(m.quotes),ServicesController_changeQuote:versioned,
 AdministrationController_cases:z.array(support),AdministrationController_support:status,AdministrationController_supportQueue:z.array(m.support_cases),AdministrationController_updateSupport:versioned,
 AdministrationController_audit:z.array(m.audit_events),AdministrationController_users:z.array(m.profiles.pick({id:true,display_name:true,email:true,state:true})),AdministrationController_suspend:m.profiles.pick({id:true,state:true}),
 AdministrationController_memberships:z.array(m.memberships.pick({id:true,user_id:true,role:true,status:true}).extend({display_name:s})),AdministrationController_dashboard:z.object({listings:n,leads:n,leases:n,maintenance:n,asOf:s,definition:s})
} as const;
