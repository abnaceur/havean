/** Session lifecycle only. Synthetic API doubles cannot certify a headset. */
export interface ImmersiveSession extends EventTarget {end():Promise<void>}
export type ImmersiveState={support:'checking'|'unavailable'|'available';session:'idle'|'entering'|'active'|'exiting';error:string};
export type ImmersivePort={supported:()=>Promise<boolean>;request:()=>Promise<ImmersiveSession>;attach:(session:ImmersiveSession,isCurrent:()=>boolean)=>Promise<void>;detach:()=>void};
export class ImmersiveSessionController{
 private disposed=false;private current:ImmersiveSession|null=null;
 private state:ImmersiveState={support:'checking',session:'idle',error:''};
 constructor(private port:ImmersivePort,private changed:(state:ImmersiveState)=>void){}
 private update(patch:Partial<ImmersiveState>){this.state={...this.state,...patch};if(!this.disposed)this.changed({...this.state});}
 async probe(){try{const available=await this.port.supported();if(!this.disposed)this.update({support:available?'available':'unavailable',error:''});}catch{if(!this.disposed)this.update({support:'unavailable',error:'VR support could not be checked. The 3D preview remains available.'});}}
 private ended=()=>{const session=this.current;this.current=null;session?.removeEventListener('end',this.ended);if(!this.disposed){this.port.detach();this.update({session:'idle',error:''});}};
 async enter(gesture:boolean){
  if(this.disposed||this.state.support!=='available'||this.state.session!=='idle')return;
  if(!gesture){this.update({error:'Use the Enter VR button to start a headset session.'});return;}
  this.update({session:'entering',error:''});let session:ImmersiveSession|null=null;
  try{
   // Request immediately in the trusted click stack, before any awaited work.
   session=await this.port.request();
   if(this.disposed){await session.end();return;}
   this.current=session;session.addEventListener('end',this.ended);
   await this.port.attach(session,()=>!this.disposed&&this.current===session);
   if(this.disposed||this.current!==session){await session.end().catch(()=>{});return;}
   this.update({session:'active'});
  }catch{
   session?.removeEventListener('end',this.ended);if(this.current===session)this.current=null;
   if(session)await session.end().catch(()=>{});
   if(!this.disposed){this.port.detach();this.update({session:'idle',error:'VR could not start. Use the 3D preview or try again.'});}
  }
 }
 async exit(){
  if(this.disposed||!this.current||this.state.session!=='active')return;
  const session=this.current;this.update({session:'exiting',error:''});
  try{await session.end();if(this.current===session)this.ended();}
  catch{if(!this.disposed&&this.current===session)this.update({session:'active',error:'VR could not exit. Retry or use your headset system menu.'});}
 }
 dispose(){if(this.disposed)return;this.disposed=true;const session=this.current;this.current=null;session?.removeEventListener('end',this.ended);if(session)void session.end().catch(()=>{});this.port.detach();}
}
