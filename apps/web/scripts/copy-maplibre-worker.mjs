import {copyFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),root=path.dirname(require.resolve('maplibre-gl/package.json'));
const destination=path.resolve(import.meta.dirname,'../public/maplibre');
mkdirSync(destination,{recursive:true});
// MapLibre 6 workers import their sibling shared module. Next does not emit it
// beside its hashed worker asset; keep both pinned files on the same origin.
for(const file of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'])copyFileSync(path.join(root,'dist',file),path.join(destination,file));
copyFileSync(path.join(root,'LICENSE.txt'),path.join(destination,'LICENSE.txt'));
