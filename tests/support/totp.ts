import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import type {Page} from '@playwright/test';
export function totp(secret:string,now=Date.now()){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
 for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
 const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
 const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();const offset=hash[19]&15;
 return ((hash.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
export function personaOtp(persona:string){const secrets=JSON.parse(fs.readFileSync((process.env.HAVEN_GENERATED_DIR||'infra/generated')+'/otp.json','utf8'));return secrets[persona]?totp(secrets[persona]):null;}
export async function completeOtp(page:Page,persona:string){
 if(process.env.NODE_ENV==='development'||!personaOtp(persona))return;
 for(let attempt=0;attempt<3;attempt++){
  await page.getByLabel('One-time code',{exact:true}).fill(personaOtp(persona)!);
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  const origins=[process.env.PUBLIC_WEB_URL||'http://localhost:8088',process.env.PUBLIC_OPS_URL||'http://localhost:8089'];
  await page.waitForFunction(origins=>origins.includes(location.origin)||document.body?.innerText.includes('Invalid authenticator code.'),origins);
  const result=origins.includes(new URL(page.url()).origin);
  if(result)return;
  // Keycloak rejects reuse of a successful OTP, including between isolated browser contexts.
  await page.waitForTimeout(30000-Date.now()%30000+100);
 }
 throw new Error('Staff OTP authentication failed');
}
