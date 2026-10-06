'use client';
import {useEffect,useRef,useState} from 'react';
import {chatSocketFrame,type ChatMessageRecord} from '@haven/contracts';
export function ConversationRealtime({id,sequence,received,accessChanged}:{id:string;sequence:string;received:(rows:ChatMessageRecord[])=>void;accessChanged:(allowed:boolean)=>void}){
 const [state,setState]=useState('Connecting to live updates…'),latest=useRef(sequence),receive=useRef(received),access=useRef(accessChanged),retry=useRef<()=>void>(()=>{});receive.current=received;access.current=accessChanged;if(BigInt(sequence)>BigInt(latest.current))latest.current=sequence;
 useEffect(()=>{let socket:WebSocket|undefined,timer:ReturnType<typeof setTimeout>|undefined,disposed=false,attempt=0,denied=false;latest.current=sequence;
  function connect(){if(disposed||denied)return;if(timer)clearTimeout(timer);if(socket){socket.onclose=null;socket.close();}setState(attempt?'Reconnecting; saved messages will be recovered…':'Connecting to live updates…');socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/v1/realtime/conversations/'+id);let subscribed=false;
   socket.onmessage=e=>{let decoded:unknown;try{decoded=JSON.parse(e.data);}catch{socket?.close(1002,'Invalid message frame');return;}const parsed=chatSocketFrame.safeParse(decoded);if(!parsed.success){socket?.close(1002,'Invalid message frame');return;}const frame=parsed.data;if(frame.type==='error'){setState(frame.message);return;}if(frame.conversationId!==id){socket?.close(1002,'Unexpected conversation');return;}
    if(frame.type==='subscribed'){if(!subscribed){subscribed=true;socket?.send(JSON.stringify({type:'subscribe',conversationId:id,after:latest.current}));}return;}
    if(frame.type==='messages'){receive.current(frame.messages);if(BigInt(frame.after)>BigInt(latest.current))latest.current=frame.after;return;}
    if(frame.type==='caught_up'){access.current(true);attempt=0;setState('Live updates connected.');}
   };
   socket.onclose=e=>{if(disposed)return;if(e.code===1008){access.current(false);denied=true;setState('Conversation access ended. Refresh your session or select another conversation.');return;}attempt++;setState('Connection interrupted; reconnecting to recover saved messages…');timer=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt-1,5)));};socket.onerror=()=>socket?.close();
  }
  retry.current=()=>{denied=false;attempt=0;connect();};const online=()=>{if(!denied)connect();};window.addEventListener('online',online);connect();return()=>{disposed=true;if(timer)clearTimeout(timer);window.removeEventListener('online',online);socket?.close();};
 // Start once per room. The ref advances as persisted rows arrive through either transport.
 },[id]);
 return <div className="conversation-connection"><p role="status" aria-label="Conversation connection">{state}</p>{state!=='Live updates connected.'&&<button type="button" className="button secondary small" onClick={()=>retry.current()}>Reconnect conversation</button>}</div>;
}
