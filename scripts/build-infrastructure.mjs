import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const file=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.statSync(file).isFile()||(fs.statSync(file).mode&0o077))throw Error('Protected Compose environment file required');
if(fs.realpathSync(file).startsWith(fs.realpathSync('.')+path.sep))throw Error('Protected environment must remain outside the Docker build context');
let text=fs.readFileSync(file,'utf8');
for(const [name,tag] of [['database','17.11-postgis3.6.4'],['identity','26.8.0-java21'],['scanner','1.5.4-pcre2-10.49']]){
 const image='haven-local-'+name+':'+tag;
 execFileSync('docker',['build','-f','infra/Dockerfile.'+name,'-t',image,'.'],{stdio:'inherit'});
 const id=execFileSync('docker',['inspect','--format','{{.Id}}',image],{encoding:'utf8'}).trim();
 if(!/^sha256:[a-f0-9]{64}$/.test(id))throw Error('Immutable built image identifier required');
 const key='HAVEN_'+name.toUpperCase()+'_IMAGE',line=key+'='+id;
 text=new RegExp('^'+key+'=.*$','m').test(text)?text.replace(new RegExp('^'+key+'=.*$','m'),line):text.trimEnd()+'\n'+line+'\n';
}
// No environment or identity secret is passed to Docker builds or printed.
fs.writeFileSync(file,text,{mode:0o600});
console.log('Three compiled infrastructure image IDs recorded in the protected Compose environment.');
