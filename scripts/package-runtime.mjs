import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.resolve(process.argv[2]||'infra/generated/runtime-package');
if(output===root||root.startsWith(output+path.sep))throw Error('Runtime destination must not contain source workspace');
fs.mkdirSync(output,{recursive:true});fs.copyFileSync(path.join(root,'pnpm-workspace.yaml'),path.join(output,'pnpm-workspace.yaml'));
for(const [area,names] of [['packages',['config','contracts','database']],['apps',['api','worker']]])for(const name of names){const source=path.join(root,area,name),destination=path.join(output,area,name);if(fs.existsSync(destination))throw Error('Use an empty runtime destination');fs.mkdirSync(path.dirname(destination),{recursive:true});execFileSync('pnpm',['--filter','@haven/'+name,'deploy','--prod','--legacy',destination],{cwd:root,stdio:'inherit'});if(!fs.existsSync(path.join(source,'dist')))throw Error('Missing compiled '+name);fs.cpSync(path.join(source,'dist'),path.join(destination,'dist'),{recursive:true});fs.rmSync(path.join(destination,'src'),{recursive:true,force:true});}
fs.cpSync(path.join(root,'packages/database/migrations'),path.join(output,'packages/database/migrations'),{recursive:true});fs.mkdirSync(path.join(output,'packages/test-support/fixtures'),{recursive:true});fs.copyFileSync(path.join(root,'packages/test-support/fixtures/beijing.json'),path.join(output,'packages/test-support/fixtures/beijing.json'));
for(const name of ['api','worker']){const app=path.join(output,'apps',name),emitted=path.join(app,'dist/apps');for(const sibling of fs.readdirSync(emitted)){const link=path.join(emitted,sibling,'node_modules');fs.rmSync(link,{recursive:true,force:true});fs.symlinkSync(path.relative(path.dirname(link),path.join(app,'node_modules')),link,'dir');}}
console.log(JSON.stringify({event:'runtime.packaged',typescriptLoader:false,packageManagerIncluded:false,destination:output}));

fs.mkdirSync(path.join(output,'scripts'),{recursive:true});for(const name of ['schema-preflight.mjs','production-preflight.mjs','production-routes.mjs'])fs.copyFileSync(path.join(root,'scripts',name),path.join(output,'scripts',name));fs.mkdirSync(path.join(output,'infra/production'),{recursive:true});execFileSync('node',['scripts/release-manifest.mjs',path.join(output,'infra/production/schema-compatibility.json')],{cwd:root,stdio:'inherit'});
