'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LibreMap,GeoJSONSource,StyleSpecification} from 'maplibre-gl';
import {priceLabel,sdk} from '@haven/contracts';
import {useQuery} from '@tanstack/react-query';
export type MapProperty={id:string;slug:string;title:string;transaction:string;segment:string;price:string|null;currency:string;rentPeriod:string|null;area:string;beds:number;livingRooms:number;community:string;district:string;city:string;latitude:number;longitude:number;sponsored?:boolean;curationLabel?:string|null};
const localStyle:StyleSpecification={version:8,sources:{},layers:[{id:'local-background',type:'background',paint:{'background-color':'#e9eee8'}}]};
export function PropertyMap({properties,selected,onSelect,onBounds,style,attribution,selectionControls=true}:{properties:MapProperty[];selected:string|null;onSelect:(id:string)=>void;onBounds:(bounds:string)=>void;style:string|null;attribution:string;selectionControls?:boolean}){
 const node=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null),callbacks=useRef({onSelect,onBounds}),records=useRef(properties),[ready,setReady]=useState(false),[failure,setFailure]=useState(''),[cluster,setCluster]=useState<MapProperty[]>([]);
 const [preview,setPreview]=useState<{property:MapProperty;x:number;y:number;maxHeight:number}|null>(null),previewNode=useRef<HTMLDivElement>(null),dismissTimer=useRef<ReturnType<typeof setTimeout>|null>(null),selectedId=useRef(selected),refreshMarkers=useRef<()=>void>(()=>{});
 selectedId.current=selected;
 const previewDetail=useQuery({queryKey:['map-preview',preview?.property.id],queryFn:({signal})=>sdk.DiscoveryController_listing({params:{id:preview!.property.id},query:{city:preview!.property.city},signal}),enabled:!!preview,staleTime:30000,retry:false});
 function keepPreview(){if(dismissTimer.current)clearTimeout(dismissTimer.current);}
 function dismissPreview(){keepPreview();dismissTimer.current=setTimeout(()=>{if(!previewNode.current?.contains(document.activeElement)&&!document.activeElement?.matches('.map-price-pin'))setPreview(null);},180);}
 useEffect(()=>{if(preview&&!properties.some(p=>p.id===preview.property.id))setPreview(null);},[properties,preview]);
 callbacks.current={onSelect,onBounds};records.current=properties;
 useEffect(()=>{let disposed=false;let instance:LibreMap|undefined;const markers=new Map<string,{marker:{remove:()=>void;setLngLat:(coordinates:[number,number])=>unknown;getLngLat:()=>{lng:number;lat:number}};element:HTMLButtonElement}>();
  import('maplibre-gl').then(libre=>{
   if(disposed||!node.current)return;
   try{
    libre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    instance=new libre.Map({container:node.current,style:style||localStyle,center:[0,0],zoom:1,attributionControl:{compact:false},maxZoom:17});map.current=instance;
    const expandCluster=async(id:number,coordinates:[number,number])=>{
     if(!instance)return;const source=instance.getSource('properties') as GeoJSONSource;
     const leaves=await source.getClusterLeaves(id,500,0);if(disposed)return;
     const ids=new Set(leaves.map(x=>String(x.properties?.id)));setCluster(records.current.filter(x=>ids.has(x.id)));
     const zoom=await source.getClusterExpansionZoom(id);if(!disposed&&instance)instance.easeTo({center:coordinates,zoom:Math.min(zoom,17)});
    };
    const renderMarkers=()=>{
     if(!instance?.getLayer('property-clusters'))return;
     const seen=new Set<string>();
     for(const feature of instance.queryRenderedFeatures({layers:['property-clusters','property-pins']})){
      if(feature.geometry.type!=='Point')continue;
      const clustered=feature.properties?.cluster_id!==undefined,id=clustered?'cluster-'+feature.properties!.cluster_id:String(feature.properties?.id);
      if(seen.has(id))continue;seen.add(id);
      const property=records.current.find(p=>p.id===id);if(!clustered&&!property)continue;
      let entry=markers.get(id);
      if(!entry){
       const element=document.createElement('button');element.type='button';
       element.addEventListener('click',event=>{event.stopPropagation();keepPreview();setPreview(null);setCluster([]);if(clustered){const position=entry!.marker.getLngLat();void expandCluster(Number(feature.properties?.cluster_id),[position.lng,position.lat]).catch(()=>setCluster([]));}else callbacks.current.onSelect(id);});
       const show=()=>{const current=records.current.find(p=>p.id===id);if(!current||!selectionControls||!instance)return;keepPreview();const point=instance.project([current.longitude,current.latitude]);const below=(node.current?.clientHeight||440)-point.y-34,above=point.y-34,placeBelow=below>=above,maxHeight=Math.max(100,Math.min(300,placeBelow?below:above));setPreview({property:current,x:Math.max(8,Math.min(point.x-130,(node.current?.clientWidth||300)-276)),y:placeBelow?point.y+26:Math.max(8,point.y-26-maxHeight),maxHeight});};
       if(!clustered){element.addEventListener('mouseenter',show);element.addEventListener('focus',show);element.addEventListener('mouseleave',dismissPreview);element.addEventListener('blur',dismissPreview);element.addEventListener('keydown',event=>{if(event.key==='Escape'){keepPreview();setPreview(null);}});}
       entry={element,marker:new libre.Marker({element}).setLngLat(feature.geometry.coordinates as [number,number]).addTo(instance)};markers.set(id,entry);
      }
      entry.marker.setLngLat(feature.geometry.coordinates as [number,number]);
      entry.element.className='maplibregl-marker '+(clustered?'map-cluster-count':'map-price-pin'+(selectedId.current===id?' selected':''));
      entry.element.textContent=clustered?String(feature.properties?.point_count):priceLabel(property!.price,property!.currency,property!.rentPeriod);
      entry.element.setAttribute('aria-label',clustered?'Explore '+feature.properties?.point_count+' properties':'Preview '+property!.title);
      if(!clustered){entry.element.dataset.propertyId=id;entry.element.setAttribute('aria-pressed',String(selectedId.current===id));}
     }
     for(const [id,entry] of markers)if(!seen.has(id)){entry.marker.remove();markers.delete(id);}
    };
    refreshMarkers.current=renderMarkers;instance.on('idle',renderMarkers);
    instance.on('movestart',()=>{keepPreview();setPreview(null);});
    instance.addControl(new libre.NavigationControl({showCompass:true}),'top-right');
    instance.on('error',()=>{if(disposed)return;setFailure('Map tiles are unavailable. Property locations and the list remain available.');if(!instance?.getSource('properties'))instance?.setStyle(localStyle);});
    instance.on('load',()=>{if(disposed||!instance)return;setReady(true);});
    instance.on('moveend',()=>{if(!instance)return;const b=instance.getBounds();const west=Math.max(-180,b.getWest()),east=Math.min(180,b.getEast()),south=Math.max(-90,b.getSouth()),north=Math.min(90,b.getNorth());if(west<east&&south<north)callbacks.current.onBounds([west,south,east,north].map(x=>x.toFixed(6)).join(','));});
    instance.on('click','property-clusters',event=>{const feature=event.features?.[0];if(feature?.geometry.type==='Point')void expandCluster(Number(feature.properties?.cluster_id),feature.geometry.coordinates as [number,number]).catch(()=>setCluster([]));});
    instance.on('click','property-pins',event=>{const id=event.features?.[0]?.properties?.id;if(id){setCluster([]);callbacks.current.onSelect(String(id));}});
    for(const layer of ['property-clusters','property-pins']){instance.on('mouseenter',layer,()=>{if(instance)instance.getCanvas().style.cursor='pointer';});instance.on('mouseleave',layer,()=>{if(instance)instance.getCanvas().style.cursor='';});}
   }catch{setFailure('This browser cannot display the map. Use the property list below.');}
  }).catch(()=>setFailure('The map could not load. Use the property list below.'));
  return()=>{disposed=true;keepPreview();refreshMarkers.current=()=>{};for(const {marker} of markers.values())marker.remove();instance?.remove();map.current=null;setReady(false);};
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
  refreshMarkers.current();
 },[properties,selected,ready]);
 const fitted=useRef(false);
 useEffect(()=>{const instance=map.current;if(!ready||!instance||!properties.length||fitted.current)return;fitted.current=true;const lng=properties.map(x=>x.longitude),lat=properties.map(x=>x.latitude);instance.fitBounds([[Math.min(...lng),Math.min(...lat)],[Math.max(...lng),Math.max(...lat)]],{padding:55,maxZoom:13,duration:0});},[ready,properties]);
 return <section className="property-map" aria-label="Property locations"><div className="map-canvas" ref={node} data-map-ready={ready?'true':'false'}/>{failure&&<p className="map-failure" role="status">{failure}</p>}{preview&&<div ref={previewNode} className="map-hover-preview" role="region" aria-label="Property preview" style={{left:preview.x,top:preview.y,maxHeight:preview.maxHeight,overflowY:'auto'}} onMouseEnter={keepPreview} onMouseLeave={dismissPreview} onFocus={keepPreview} onBlur={dismissPreview} onKeyDown={event=>{if(event.key==='Escape'){keepPreview();setPreview(null);}}}>
 <button className="map-preview-close" aria-label="Close property preview" onClick={()=>{keepPreview();setPreview(null);}}>×</button>
 {previewDetail.data?.data.photos[0]&&<img src={previewDetail.data.data.photos[0]} alt=""/>}<strong>{preview.property.title}</strong><span>{priceLabel(preview.property.price,preview.property.currency,preview.property.rentPeriod)}</span><p>{preview.property.beds} bedrooms · {preview.property.area} m²</p><p>{preview.property.community}</p><button className="button small" onClick={()=>{onSelect(preview.property.id);keepPreview();setPreview(null);}}>Show property details</button>
 </div>}<p className="map-attribution">{attribution}</p>{selectionControls&&<label className="field map-picker"><span>Select a property on the map</span><select value={selected||''} onChange={event=>{keepPreview();setPreview(null);setCluster([]);if(event.target.value)onSelect(event.target.value);}}><option value="">Choose a property</option>{properties.map(p=><option value={p.id} key={p.id}>{p.sponsored?'Sponsored · ':''}{p.title} · {p.community} · {priceLabel(p.price,p.currency,p.rentPeriod)}</option>)}</select></label>}{cluster.length>0&&<div className="map-cluster-list"><h3>{cluster.length} properties in this area</h3><button className="text-link" onClick={()=>setCluster([])}>Close area properties</button>{cluster.map(p=><button key={p.id} onClick={()=>{setCluster([]);onSelect(p.id);}}>{p.title} · {priceLabel(p.price,p.currency,p.rentPeriod)}</button>)}</div>}</section>;
}
