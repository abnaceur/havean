import {describe,expect,it,vi} from 'vitest';
import {ImmersiveSessionController,type ImmersiveState} from '../../packages/ui/src/webxr-session.js';

class SyntheticSession extends EventTarget{end=vi.fn(async()=>{this.dispatchEvent(new Event('end'));});}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture(){const session=new SyntheticSession(),states:ImmersiveState[]=[],port={supported:vi.fn(async()=>true),request:vi.fn(async()=>session),attach:vi.fn(async()=>{}),detach:vi.fn()},controller=new ImmersiveSessionController(port,state=>states.push(state));return {session,states,port,controller};}

describe('synthetic WebXR lifecycle guards; no physical device acceptance',()=>{
 it('does not request an unavailable session or enter without a trusted gesture',async()=>{
  const {controller,port,states}=fixture();port.supported.mockResolvedValue(false);await controller.probe();await controller.enter(true);expect(port.request).not.toHaveBeenCalled();expect(states.at(-1)?.support).toBe('unavailable');
  port.supported.mockResolvedValue(true);await controller.probe();await controller.enter(false);expect(port.request).not.toHaveBeenCalled();expect(states.at(-1)?.error).toContain('Enter VR button');controller.dispose();
 });

 it('requests immediately, prevents duplicate entry, exits and restores the preview',async()=>{
  const {controller,port,session,states}=fixture();await controller.probe();const first=controller.enter(true);expect(port.request).toHaveBeenCalledTimes(1);await controller.enter(true);await first;expect(port.request).toHaveBeenCalledTimes(1);expect(states.at(-1)?.session).toBe('active');await controller.exit();expect(session.end).toHaveBeenCalledTimes(1);expect(port.detach).toHaveBeenCalledTimes(1);expect(states.at(-1)?.session).toBe('idle');controller.dispose();
 });

 it('ends a session returned after scope disposal without attaching it',async()=>{
  const {controller,port,session,states}=fixture(),pending=deferred<SyntheticSession>();port.request.mockReturnValue(pending.promise);await controller.probe();const entering=controller.enter(true);controller.dispose();const count=states.length;pending.resolve(session);await entering;expect(session.end).toHaveBeenCalledTimes(1);expect(port.attach).not.toHaveBeenCalled();expect(states).toHaveLength(count);
 });

 it('invalidates late attachment and releases denied or failed sessions',async()=>{
  const {controller,port,session,states}=fixture(),pending=deferred<void>();let current=()=>true;
  port.attach=vi.fn(async(_session:SyntheticSession,isCurrent:()=>boolean)=>{current=isCurrent;await pending.promise;});
  // A separate typed controller uses the asynchronous adapter under test.
  controller.dispose();const active=new ImmersiveSessionController(port,state=>states.push(state));await active.probe();const entering=active.enter(true);await Promise.resolve();expect(current()).toBe(true);active.dispose();expect(current()).toBe(false);pending.resolve();await entering;expect(session.end).toHaveBeenCalled();
  const failed=fixture();failed.port.attach.mockRejectedValue(new Error('private renderer diagnostic'));await failed.controller.probe();await failed.controller.enter(true);expect(failed.session.end).toHaveBeenCalled();expect(failed.states.at(-1)?.session).toBe('idle');expect(failed.states.at(-1)?.error).not.toContain('private renderer');failed.controller.dispose();
 });
});
