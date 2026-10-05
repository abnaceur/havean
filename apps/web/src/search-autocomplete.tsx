'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Search,ArrowRight} from 'lucide-react';
import {sdk} from '@haven/contracts';
type Suggestion={id:string;name:string;slug:string;kind:'community'|'district'|'neighborhood';city:string};
type Props={city:string;accountId?:string;hero?:boolean;initialText?:string;communities?:boolean};
export function SearchAutocomplete({city,accountId,hero=false,initialText='',communities=false}:Props){
 const [text,setText]=useState(initialText),[focused,setFocused]=useState(false),[suggestions,setSuggestions]=useState<Suggestion[]>([]),[history,setHistory]=useState<string[]>([]),[selected,setSelected]=useState(-1),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
 const listId=useId(),sequence=useRef(0),key='haven.recent-searches.'+city;
 useEffect(()=>{
  const generation=++sequence.current,controller=new AbortController();
  if(!focused||!text.trim())return()=>controller.abort();
  const timer=setTimeout(()=>{setLoading(true);sdk.DiscoveryController_suggestions({query:{city,q:text},signal:controller.signal}).then(result=>{if(generation===sequence.current){setSuggestions(result.data);setLoading(false);}}).catch(()=>{if(!controller.signal.aborted&&generation===sequence.current){setNotice('Suggestions are unavailable. You can still search.');setLoading(false);}});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[text,city,focused]);
 useEffect(()=>{
  const controller=new AbortController();if(!focused)return()=>controller.abort();
  if(accountId)sdk.SearchHistoryController_read({query:{city},signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setHistory(r.data.map(x=>x.query));}).catch(()=>{if(!controller.signal.aborted)setNotice('Recent searches are unavailable.');});
  else {try{const value=JSON.parse(localStorage.getItem(key)||'[]');setHistory(Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.length<=120).slice(0,10):[]);}catch{setHistory([]);}}
  return()=>controller.abort();
 },[focused,accountId,city,key]);
 async function submit(value:string,suggestion?:Suggestion){
  const query=value.trim();if(!query)return;
  try{if(accountId)await sdk.SearchHistoryController_record({body:{city,query}});else localStorage.setItem(key,JSON.stringify([query,...history.filter(x=>x!==query)].slice(0,10)));}catch{/* Browsing remains available when optional history storage fails. */}
  const params=new URLSearchParams();
  if(suggestion&&!communities){if(suggestion.kind==='community')params.set('communityId',suggestion.id);else if(suggestion.kind==='district')params.set('districtId',suggestion.id);else params.set('neighborhoodId',suggestion.id);}else params.set('text',query);
  window.location.assign('/'+city+(communities?'/communities':'/search')+'?'+params);
 }
 async function clear(){
  try{if(accountId)await sdk.SearchHistoryController_clear({query:{city}});else localStorage.removeItem(key);setHistory([]);setSelected(-1);setNotice('Recent searches cleared.');}catch{setNotice('Could not clear recent searches. Try again.');}
 }
 const choices=text.trim()?suggestions.map(x=>({label:x.name,suggestion:x})):history.map(x=>({label:x,suggestion:undefined}));
 return <form className={(hero?'hero-search':'list-search')+' search-autocomplete'} onSubmit={e=>{e.preventDefault();const choice=choices[selected];void submit(choice?.label||text,choice?.suggestion);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setFocused(false);setSelected(-1);}}}>
  <Search size={hero?21:20}/><input role="combobox" aria-label={hero?'Search homes, neighborhoods or communities':'Search properties'} aria-expanded={focused} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={selected>=0?listId+'-'+selected:undefined} autoComplete="off" maxLength={120} placeholder={hero?'Search homes, neighborhoods, communities':'Search a neighborhood, community or home'} value={text} onFocus={()=>setFocused(true)} onChange={e=>{sequence.current++;setText(e.target.value);setSuggestions([]);setSelected(-1);setLoading(false);setNotice('');}} onKeyDown={e=>{if(e.key==='Escape'){setFocused(false);setSelected(-1);}else if(e.key==='ArrowDown'){e.preventDefault();setFocused(true);setSelected(Math.min(selected+1,choices.length-1));}else if(e.key==='ArrowUp'){e.preventDefault();setSelected(Math.max(-1,selected-1));}}}/>
  <button className={hero?undefined:'button small'} type="submit">Search {hero&&<ArrowRight size={17}/>}</button>
  {focused&&<div className="search-suggestions"><div className="search-suggestions-heading"><strong>{text.trim()?'Suggestions':'Recent searches'}</strong>{!text.trim()&&history.length>0&&<button type="button" onClick={()=>void clear()}>Clear history</button>}</div><div id={listId} role="listbox" aria-label={text.trim()?'Search suggestions':'Recent searches'}>{choices.map((choice,index)=><button id={listId+'-'+index} type="button" role="option" aria-selected={selected===index} key={choice.suggestion?.id||choice.label} onClick={()=>void submit(choice.label,choice.suggestion)}><span>{choice.label}</span>{choice.suggestion&&<small>{choice.suggestion.kind} · {city}</small>}</button>)}</div>{loading&&<p role="status">Searching…</p>}{!loading&&choices.length===0&&<p>{text.trim()?'Type a location or search all property titles.':'Your searches will appear here.'}</p>}{notice&&<p role="status">{notice}</p>}</div>}
 </form>;
}
