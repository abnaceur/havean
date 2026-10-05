'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,sdk,ApiError,type Listing} from '@haven/contracts';
const intentKey='haven.favorite-intent';
type Intent={id:string;returnTo:string;expires:number};
function remember(id:string){const value:Intent={id,returnTo:window.location.pathname+window.location.search,expires:Date.now()+600000};try{sessionStorage.setItem(intentKey,JSON.stringify(value));return true;}catch{return false;}}
function consume(){try{const raw=sessionStorage.getItem(intentKey);if(!raw)return;const value=JSON.parse(raw) as Intent;sessionStorage.removeItem(intentKey);if(value.expires>Date.now()&&value.returnTo===window.location.pathname+window.location.search&&/^[a-f0-9-]{36}$/i.test(value.id))return value.id;}catch{/* Invalid or inaccessible storage never triggers a mutation. */}}
export function useFavorites(accountId:string|undefined,signIn:()=>void,notice:(message:string)=>void){
 const client=useQueryClient(),key=['favorites',accountId],favorites=useQuery({queryKey:key,queryFn:({signal})=>api<Listing[]>('/me/favorites',{signal}),enabled:!!accountId,retry:false});
 const [optimistic,setOptimistic]=useState<Record<string,boolean>>({}),pending=useRef(new Set<string>()),consumed=useRef('');
 const isSaved=useCallback((id:string)=>optimistic[accountId+':'+id]??favorites.data?.data.some(item=>item.id===id)??false,[optimistic,favorites.data,accountId]);
 const toggle=useCallback(async(id:string,forceSave=false)=>{
  if(!accountId){if(!remember(id))notice('Sign in, then save this home again. Your browser could not remember the request.');signIn();return;}
  if(pending.current.has(accountId+':'+id))return;pending.current.add(accountId+':'+id);
  const desired=forceSave||!isSaved(id);setOptimistic(value=>({...value,[accountId+':'+id]:desired}));
  try{
   const current=await sdk.EngagementController_favoriteState({params:{id}});
   // A returned login intent always means Save, even if another tab already saved it.
   if(current.data.saved!==desired){const request={params:{id},body:{version:current.data.version,listingVersion:current.data.listingVersion}};if(desired)await sdk.EngagementController_favorite(request);else await sdk.EngagementController_unfavorite(request);}
   await client.invalidateQueries({queryKey:['favorites',accountId]});notice(desired?'Home saved to your favorites':'Removed from saved homes');
  }catch(e){notice(e instanceof Error?e.message:'Could not save this home');if(e instanceof ApiError&&e.status===401){if(desired)remember(id);client.clear();signIn();}else if(e instanceof ApiError&&e.status===409)await client.invalidateQueries({queryKey:['favorites',accountId]});}
  finally{pending.current.delete(accountId+':'+id);setOptimistic(value=>{const next={...value};delete next[accountId+':'+id];return next;});}
 },[accountId,isSaved,client,notice,signIn]);
 useEffect(()=>{if(!accountId||favorites.isPending||favorites.isError||consumed.current===accountId)return;consumed.current=accountId;const id=consume();if(id)void toggle(id,true);},[accountId,favorites.isPending,favorites.isError,toggle]);
 return {favorites,isSaved,toggle};
}
