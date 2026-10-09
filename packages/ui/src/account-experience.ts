// Presentation only. API sessions, current memberships and resource grants
// remain responsible for every read and mutation.
export type AccountKind='buyer'|'owner'|'tenant'|'agent'|'manager'|'agency_manager'|'developer'|'vendor'|'moderator'|'support'|'admin'|'editor';
type Experience={kind:AccountKind;title:string;description:string;webPath:string;workspacePath:string|null};
const experiences:Record<AccountKind,Experience>={
 buyer:{kind:'buyer',title:'Buyer account',description:'Your saved homes, viewings and conversations.',webPath:'/account',workspacePath:null},
 owner:{kind:'owner',title:'Owner workspace',description:'Manage your properties, publication requests and owner statements.',webPath:'/account',workspacePath:null},
 tenant:{kind:'tenant',title:'Tenant account',description:'Your leases, balances and maintenance requests.',webPath:'/tenant/leases',workspacePath:null},
 agent:{kind:'agent',title:'Agent dashboard',description:'Your assigned listings, client pipeline and viewing schedule.',webPath:'/account',workspacePath:'/ops'},
 manager:{kind:'manager',title:'Property management dashboard',description:'Your portfolio, tenancies, financial records and maintenance.',webPath:'/account',workspacePath:'/ops'},
 agency_manager:{kind:'agency_manager',title:'Agency workspace',description:'Your team, memberships and property assignments.',webPath:'/account',workspacePath:'/ops/agency'},
 developer:{kind:'developer',title:'Developer workspace',description:'Your developments, floor plans, inventory and buyer inquiries.',webPath:'/account',workspacePath:'/ops/developments'},
 vendor:{kind:'vendor',title:'Vendor workspace',description:'Your service profiles, portfolio and quote requests.',webPath:'/account',workspacePath:'/ops/providers'},
 moderator:{kind:'moderator',title:'Moderation workspace',description:'Review publication submissions, evidence and verification decisions.',webPath:'/account',workspacePath:'/ops/reviews'},
 support:{kind:'support',title:'Support workspace',description:'Your assigned cases, customer replies and resolution history.',webPath:'/account',workspacePath:'/ops/support'},
 admin:{kind:'admin',title:'Administration workspace',description:'Manage accounts, platform configuration and audited administration.',webPath:'/account',workspacePath:'/ops/admin'},
 editor:{kind:'editor',title:'Editorial workspace',description:'Manage home content, rankings and approved curation.',webPath:'/account',workspacePath:'/ops/rankings'}
};
export function accountExperience(roles:readonly string[]):Experience{
 const priority:[string,AccountKind][]=[['admin','admin'],['agency_manager','agency_manager'],['property_manager','manager'],['finance','manager'],['developer','developer'],['agent','agent'],['vendor','vendor'],['moderator','moderator'],['support','support'],['editor','editor'],['owner','owner'],['tenant','tenant']];
 return {...experiences[priority.find(([role])=>roles.includes(role))?.[1]||'buyer']};
}
export function accountSectionVisible(section:string,roles:readonly string[]):boolean{
 if(['management','statements','properties'].includes(section))return roles.includes('owner')||roles.includes('admin');
 return ['','profile','favorites','history','searches','notifications','privacy','quotes','viewings','messages'].includes(section);
}
