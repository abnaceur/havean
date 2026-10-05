import fs from 'node:fs';
import path from 'node:path';
export function assertImport(file,specifier){
 const app=file.match(/apps\/(\w+)/)?.[1];
 if(app && /apps\//.test(specifier) && !specifier.includes(`apps/${app}/`)) throw Error(`Cross-application import: ${file} -> ${specifier}`);
 if(['web','ops'].includes(app) && /@haven\/database|apps\/api/.test(specifier)) throw Error(`Business database boundary: ${file}`);
}
export function assertMutation(module,table){
 const modules=JSON.parse(fs.readFileSync('docs/adr/modules.json','utf8'));
 if(!modules[module]?.tables.includes(table))throw Error(`Undocumented mutation ${module}.${table}`);
}
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','dist'].includes(ent.name)||ent.name.startsWith('.next'))continue;const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(/\.[jt]sx?$/.test(p)){const s=fs.readFileSync(p,'utf8');for(const m of s.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))assertImport(p,m[1]);}}}
if(process.argv[1]?.endsWith('boundaries.mjs')){walk('apps');console.log('Application import boundaries passed');}
