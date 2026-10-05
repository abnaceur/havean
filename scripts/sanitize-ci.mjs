import fs from 'node:fs';
const env={...process.env};
if(process.env.HAVEN_SANITIZE_ENV){for(const line of fs.readFileSync(process.env.HAVEN_SANITIZE_ENV,'utf8').split('\n')){const i=line.indexOf('=');if(i>0)env[line.slice(0,i)]=line.slice(i+1);}}
const secrets=Object.entries(env).filter(([key,value])=>/SECRET|PASSWORD|SESSION_KEY|SEARCH_KEY|ACCESS_KEY/.test(key)&&value?.length>=8).map(([,value])=>value);
for(const file of fs.readdirSync('evidence/ci').filter(name=>name.endsWith('.log'))){const path='evidence/ci/'+file;let text=fs.readFileSync(path,'utf8');for(const value of secrets)text=text.split(value).join('[REDACTED]');text=text.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');fs.writeFileSync(path,text);}
