import {verifyGatewayClient} from '@haven/config';
import type {FastifyRequest} from 'fastify';
// Transport addresses remain the fallback. Caller-supplied forwarding headers
// cannot create rate buckets without a current server-signed gateway context.
export function requestRateAddress(req:Pick<FastifyRequest,'headers'|'method'|'url'|'ip'>,key:string,origins:readonly string[]){
 const origin=req.headers['x-bff-origin'];
 if(typeof origin!=='string'||!origins.includes(origin))return req.ip;
 return verifyGatewayClient(req.headers['x-haven-gateway-client'],key,{origin,method:req.method,path:req.url.split('?')[0]})||req.ip;
}
