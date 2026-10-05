import fs from 'node:fs';
fs.mkdirSync('evidence/ci',{recursive:true});
for(const name of fs.readdirSync('evidence/ci'))if(name.endsWith('.log')||name==='report-upload.json')fs.rmSync('evidence/ci/'+name,{force:true});
for(const path of ['test-results','evidence/latest-fixture-fingerprint.json','evidence/visual/layout-shift-pixel-result.json'])fs.rmSync(path,{recursive:true,force:true});
fs.chownSync('evidence/ci',Number(process.env.HAVEN_HOST_UID),Number(process.env.HAVEN_HOST_GID));
