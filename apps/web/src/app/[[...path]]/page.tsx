import type {Metadata} from 'next';
import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import ConsumerApp from '../../consumer';
const names:Record<string,string>={rankings:'Property rankings',map:'Property map',buy:'Homes for sale',rent:'Homes to rent','new-homes':'New homes',commercial:'Commercial spaces',communities:'Communities',agents:'Local agents',renovation:'Renovation & design','list-property':'List your property',search:'Find your next home',tools:'Mortgage calculator',account:'Your account',tenant:'Tenant portal',support:'Help & support'};
export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata>{const {path=[]}=await params;return {title:names[path[1]]||names[path[0]]||'Find a place to call yours',robots:path.some(p=>['account','tenant','ops'].includes(p))?{index:false,follow:false}:undefined};}
export default async function Page({params}:{params:Promise<{path?:string[]}>}){
 const {path=[]}=await params,jar=await cookies(),preferred=jar.get('haven_city')?.value||'bj';
 const base=(process.env.API_INTERNAL_URL||'http://api:4000')+'/api/v1';
 let cities:any[]|null=null;
 try{const response=await fetch(base+'/cities',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.ok)cities=(await response.json()).data;}catch{/* Data errors use the ordinary retryable page state. */}
 if(!path.length)redirect('/'+(cities?.some(city=>city.slug===preferred)?preferred:'bj'));
 const privatePage=['account','tenant'].includes(path[0]),selected=privatePage?(cities?.some(city=>city.slug===preferred)?preferred:'bj'):path[0];
 const city=cities?.find(row=>row.slug===selected)||{id:'',slug:selected,name:selected==='bj'?'Beijing':selected,currency:'CNY',timezone:'Asia/Shanghai'};
 if(!privatePage&&(cities&&!cities.some(row=>row.slug===selected)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selected)))notFound();
 const section=privatePage?path[0]:path[1]||'home',detail=privatePage?path[1]:path[2];
 if(!privatePage&&section!=='home'&&!names[section])notFound();
 const endpoints:Record<string,string>={home:'/discovery/home?city='+selected,buy:'/listings?city='+selected+'&transaction=sale&segment=residential',rent:'/listings?city='+selected+'&transaction=rent&segment=residential',commercial:'/listings?city='+selected+'&segment=commercial','new-homes':'/developments?city='+selected,communities:'/communities?city='+selected,agents:'/agents?city='+selected,renovation:'/renovation/providers?city='+selected,search:'/listings?city='+selected};
 const details:Record<string,string>={buy:'/listings/',rent:'/listings/',commercial:'/listings/','new-homes':'/developments/',communities:'/communities/',agents:'/agents/',renovation:'/renovation/providers/'};
 let initial=null,error=null;
 const endpoint=detail&&details[section]?details[section]+encodeURIComponent(detail)+'?city='+selected:endpoints[section];
 if(endpoint){try{const response=await fetch(base+endpoint,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.status===404)notFound();const result=await response.json();if(!response.ok)error=result.error?.message||'The service is temporarily unavailable';else initial=result;}catch(e){if(e instanceof Error&&e.message.includes('NEXT_HTTP_ERROR_FALLBACK'))throw e;error='The service is temporarily unavailable. Please try again.';}}
 return <ConsumerApp city={city} section={section} detail={detail} initial={initial} initialError={error}/>;
}
