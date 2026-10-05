'use client';
import {useQuery} from '@tanstack/react-query';
import {sdk,type Listing} from '@haven/contracts';
import {Spinner,ErrorBox} from '@haven/ui';
import {PropertyMap,type MapProperty} from './property-map';
import {MapPin,ArrowUpRight} from 'lucide-react';
export function ListingLocation({listing}:{listing:Listing}){
 const located=listing.latitude!==null&&listing.longitude!==null,configuration=useQuery({queryKey:['map-configuration'],queryFn:({signal})=>sdk.DiscoveryController_mapConfiguration({signal}),enabled:located});
 if(!located)return <p>Approximate map location is not provided. Ask the property team about this community.</p>;
 const point:MapProperty={...listing,latitude:listing.latitude!,longitude:listing.longitude!};
 return <div className="detail-map">{configuration.isPending?<Spinner/>:configuration.isError?<ErrorBox message="Map configuration is unavailable. The approximate community location remains available below." retry={()=>configuration.refetch()}/>:<PropertyMap selectionControls={false} properties={[point]} selected={point.id} onSelect={()=>{}} onBounds={()=>{}} style={configuration.data.data.style} attribution={configuration.data.data.attribution}/>}<div className="location-card"><MapPin size={30}/><div><strong>{listing.community}, {listing.district}</strong><p>{listing.city.toUpperCase()} · {point.latitude.toFixed(3)}, {point.longitude.toFixed(3)}</p></div><a className="text-link" href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=15/${point.latitude}/${point.longitude}`} target="_blank" rel="noreferrer">Open map<ArrowUpRight size={16}/></a></div></div>;
}
