import fs from 'node:fs';
const secrets=Object.entries(process.env).filter(([key,value])=>/SECRET|PASSWORD|SESSION_KEY|SEARCH_KEY|ACCESS_KEY/.test(key)&&value?.length>=8).map(([,value])=>value);
for(const file of fs.readdirSync('evidence/ci').filter(name=>name.endsWith('.log'))){const path='evidence/ci/'+file;let text=fs.readFileSync(path,'utf8');for(const value of secrets)text=text.split(value).join('[REDACTED]');text=text.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');fs.writeFileSync(path,text);}
