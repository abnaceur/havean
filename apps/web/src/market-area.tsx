'use client';
import {useQuery} from '@tanstack/react-query';
import {sdk,areaDisplay} from '@haven/contracts';
export function MarketArea({city,area}:{city:string;area:string}){const q=useQuery({queryKey:['public-market-policy',city],queryFn:()=>sdk.DiscoveryController_market({query:{city}})});return <>{areaDisplay(area,q.data?.data.data.areaUnit||'m²')}</>;}
