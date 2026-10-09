import {expect,it} from 'vitest';
import {digitizationWorkerHeaders,validDigitizationWorker,notificationWorkerHeaders} from '../../packages/config/src/index';
it('engine commands bind scope/body/method/route and expiry; unrelated service credentials do not authorize processing',()=>{
 const key='1'.repeat(64),time=Date.now(),path='/api/v1/internal/digitization/stages/opaque/lease',body={organizationId:'scope-a',actorId:'actor-a',expectedVersion:2};
 const headers=digitizationWorkerHeaders('POST',path,body,key,String(time));
 expect(validDigitizationWorker('POST',path,{expectedVersion:2,actorId:'actor-a',organizationId:'scope-a'},headers,key,time)).toBe(true);
 for(const [method,route,value,secret,now] of [['GET',path,body,key,time],['POST',path+'/publish',body,key,time],['POST',path,{...body,organizationId:'scope-b'},key,time],['POST',path,{...body,expectedVersion:3},key,time],['POST',path,body,'2'.repeat(64),time],['POST',path,body,key,time+61000]] as const)expect(validDigitizationWorker(method,route,value,headers,secret,now)).toBe(false);
 expect(validDigitizationWorker('POST',path,body,notificationWorkerHeaders('POST',path,body,key,String(time)),key,time)).toBe(false);
 expect(validDigitizationWorker('POST',path,body,headers,'',time)).toBe(false);
 expect(validDigitizationWorker('POST',path,body,{...headers,'x-digitization-signature':['invalid']},key,time)).toBe(false);
});
