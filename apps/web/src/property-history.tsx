'use client';
import {useQuery} from '@tanstack/react-query';
import {api} from '@haven/contracts';
import {ErrorBox} from '@haven/ui';
export function PropertyHistory({slug}:{slug:string}){
 const result=useQuery({queryKey:['property-history',slug],queryFn:()=>api<{prices:any[];statuses:any[]}>('/listings/'+encodeURIComponent(slug)+'/history')});
 if(result.isPending)return null;
 if(result.isError)return <section className="detail-section"><h2>Property history</h2><ErrorBox message={result.error.message} retry={()=>void result.refetch()}/></section>;
 const history=result.data.data;if(!history.prices.length&&!history.statuses.length)return null;
 const date=(value:string)=>new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Shanghai'});
 return <section className="detail-section public-history"><h2>Property history</h2><p>Approved asking prices and public availability events. An asking price is not a recorded sale price.</p>{history.prices.map(row=><article key={row.id}><strong>{row.currency} {row.previous_price??'Price on request'} → {row.next_price}</strong><p>{row.reason} · {date(row.created_at)}</p></article>)}{history.statuses.map(row=><p key={row.id}>{row.status.replaceAll('_',' ')} · {date(row.created_at)}</p>)}</section>;
}
