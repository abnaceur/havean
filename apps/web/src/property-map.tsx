'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LibreMap,GeoJSONSource,StyleSpecification} from 'maplibre-gl';
import {priceLabel} from '@haven/contracts';
export type MapProperty={id:string;slug:string;title:string;transaction:string;segment:string;price:string|null;currency:string;rentPeriod:string|null;area:string;beds:number;livingRooms:number;community:string;district:string;city:string;latitude:number;longitude:number};
const localStyle:StyleSpecification={version:8,sources:{},layers:[{id:'local-background',type:'background',paint:{'background-color':'#e9eee8'}}]};
export function PropertyMap({properties,selected,onSelect,onBounds,style,attribution}:{properties:MapProperty[];selected:string|null;onSelect:(id:string)=>void;onBounds:(bounds:string)=>void;style:string|null;attribution:string}){
 const node=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),callbacks=useRef({onSelect,onBounds}),records=useRef(properties),[ready,setReady]=useState(false),[failure,setFailure]=useState(''),[cluster,setCluster]=useState<MapProperty[]>([]);
 callbacks.current={onSelect,onBounds};records.current=properties;
 useEffect(()=>{let disposed=false;let instance:LibreMap|undefined;const clusterLabels:{remove:()=>void}[]=[];
  import('maplibre-gl').then(libre=>{
   if(disposed||!node.current)return;
   try{
    libre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    instance=new libre.Map({container:node.current,style:style||localStyle,center:[0,0],zoom:1,attributionControl:{compact:false},maxZoom:17});map.current=instance;
    instance.on('idle',()=>{if(!instance?.getLayer('property-clusters'))return;for(const marker of clusterLabels.splice(0))marker.remove();const seen=new Set<number>();for(const feature of instance.queryRenderedFeatures({layers:['property-clusters']})){const id=Number(feature.properties?.cluster_id);if(seen.has(id)||feature.geometry.type!=='Point')continue;seen.add(id);const element=document.createElement('span');element.className='map-cluster-count';element.textContent=String(feature.properties?.point_count);element.setAttribute('aria-hidden','true');clusterLabels.push(new libre.Marker({element}).setLngLat(feature.geometry.coordinates as [number,number]).addTo(instance));}});
    instance.addControl(new libre.NavigationControl({showCompass:true}),'top-right');
    instance.on('error',()=>{if(disposed)return;setFailure('Map tiles are unavailable. Property locations and the list remain available.');if(!instance?.getSource('properties'))instance?.setStyle(localStyle);});
    instance.on('load',()=>{if(disposed||!instance)return;setReady(true);});
    instance.on('moveend',()=>{if(!instance)return;const b=instance.getBounds();const west=Math.max(-180,b.getWest()),east=Math.min(180,b.getEast()),south=Math.max(-90,b.getSouth()),north=Math.min(90,b.getNorth());if(west<east&&south<north)callbacks.current.onBounds([west,south,east,north].map(x=>x.toFixed(6)).join(','));});
    instance.on('click','property-clusters',async event=>{if(!instance)return;const feature=event.features?.[0];if(!feature)return;const source=instance.getSource('properties') as GeoJSONSource;const id=Number(feature.properties?.cluster_id);const leaves=await source.getClusterLeaves(id,500,0);if(disposed)return;const ids=new Set(leaves.map(x=>String(x.properties?.id)));setCluster(records.current.filter(x=>ids.has(x.id)));const zoom=await source.getClusterExpansionZoom(id);if(disposed||!instance)return;instance.easeTo({center:(feature.geometry as {coordinates:number[]}).coordinates as [number,number],zoom:Math.min(zoom,17)});});
    instance.on('click','property-pins',event=>{const id=event.features?.[0]?.properties?.id;if(id){setCluster([]);callbacks.current.onSelect(String(id));}});
    for(const layer of ['property-clusters','property-pins']){instance.on('mouseenter',layer,()=>{if(instance)instance.getCanvas().style.cursor='pointer';});instance.on('mouseleave',layer,()=>{if(instance)instance.getCanvas().style.cursor='';});}
   }catch{setFailure('This browser cannot display the map. Use the property list below.');}
  }).catch(()=>setFailure('The map could not load. Use the property list below.'));
  return()=>{disposed=true;for(const marker of clusterLabels)marker.remove();instance?.remove();map.current=null;setReady(false);};
 },[style]);
 useEffect(()=>{
  const instance=map.current;if(!ready||!instance)return;
  const collection={type:'FeatureCollection' as const,features:properties.map(p=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[p.longitude,p.latitude]},properties:{id:p.id,title:p.title,selected:p.id===selected}}))};
  const source=instance.getSource('properties') as GeoJSONSource|undefined;
  if(source)source.setData(collection);else{
   instance.addSource('properties',{type:'geojson',data:collection,cluster:true,clusterMaxZoom:16,clusterRadius:45});
   instance.addLayer({id:'property-clusters',type:'circle',source:'properties',filter:['has','point_count'],paint:{'circle-color':'#255b45','circle-radius':['step',['get','point_count'],20,10,25,100,30],'circle-stroke-color':'#ffffff','circle-stroke-width':2}});
   // HTML labels avoid any remote font dependency in the local provider.
   instance.addLayer({id:'property-pins',type:'circle',source:'properties',filter:['!',['has','point_count']],paint:{'circle-color':['case',['get','selected'],'#bc5a31','#255b45'],'circle-radius':['case',['get','selected'],12,8],'circle-stroke-color':'#ffffff','circle-stroke-width':3}});
  }
 },[properties,selected,ready]);
 const fitted=useRef(false);
 useEffect(()=>{const instance=map.current;if(!ready||!instance||!properties.length||fitted.current)return;fitted.current=true;const lng=properties.map(x=>x.longitude),lat=properties.map(x=>x.latitude);instance.fitBounds([[Math.min(...lng),Math.min(...lat)],[Math.max(...lng),Math.max(...lat)]],{padding:55,maxZoom:13,duration:0});},[ready,properties]);
 useEffect(()=>{const p=properties.find(x=>x.id===selected);if(p&&ready)map.current?.easeTo({center:[p.longitude,p.latitude],zoom:Math.max(map.current.getZoom(),14),duration:250});},[selected,properties,ready]);
 return <section className="property-map" aria-label="Property locations"><div className="map-canvas" ref={node} data-map-ready={ready?'true':'false'}/>{failure&&<p className="map-failure" role="status">{failure}</p>}<p className="map-attribution">{attribution}</p><label className="field map-picker"><span>Select a property on the map</span><select value={selected||''} onChange={event=>{setCluster([]);if(event.target.value)onSelect(event.target.value);}}><option value="">Choose a property</option>{properties.map(p=><option value={p.id} key={p.id}>{p.title} · {p.community} · {priceLabel(p.price,p.currency,p.rentPeriod)}</option>)}</select></label>{cluster.length>0&&<div className="map-cluster-list"><h3>{cluster.length} properties in this area</h3><button className="text-link" onClick={()=>setCluster([])}>Close area properties</button>{cluster.map(p=><button key={p.id} onClick={()=>{setCluster([]);onSelect(p.id);}}>{p.title} · {priceLabel(p.price,p.currency,p.rentPeriod)}</button>)}</div>}</section>;
}
