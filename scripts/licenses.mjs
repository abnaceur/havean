import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateProcessingLicenses} from './processing-licenses.mjs';
const manifest=JSON.parse(fs.readFileSync('docs/adr/dependencies.json','utf8'));
for(const [name,entry] of Object.entries(manifest)){
 if(!entry.license||!entry.version)throw Error(`Missing license/version: ${name}`);
 for(const notice of entry.notices||[]){
  if(!notice.path||!/^docs\/adr\/licenses\//.test(notice.path)||! /^[a-f0-9]{64}$/.test(notice.sha256))throw Error(`Invalid dependency notice: ${name}`);
  const resolved=fs.realpathSync(notice.path),relative=path.relative(fs.realpathSync('.'),resolved);
  if(relative.startsWith('..')||path.isAbsolute(relative)||createHash('sha256').update(fs.readFileSync(resolved)).digest('hex')!==notice.sha256)throw Error(`Dependency notice checksum/path mismatch: ${name}`);
 }
}
const images=JSON.parse(fs.readFileSync('docs/adr/images.json','utf8'));
const serviceLicenses={'postgres':'PostgreSQL','eclipse-temurin':'GPL-2.0-with-classpath-exception + third-party notices','python':'Python-2.0 + Debian third-party notices','node':'MIT + third-party notices','postgis/postgis':'PostgreSQL AND GPL-2.0-or-later','quay.io/keycloak/keycloak':'Apache-2.0','getmeili/meilisearch':'MIT','valkey/valkey':'BSD-3-Clause','chrislusf/seaweedfs':'Apache-2.0','traefik':'MIT','axllent/mailpit':'MIT','clamav/clamav':'GPL-2.0-or-later'};
for(const image of Object.values(images)){if(!/@sha256:[a-f0-9]{64}$/.test(image))throw Error('Missing image digest: '+image);const repository=image.split(':')[0];if(!serviceLicenses[repository])throw Error('Missing service license: '+repository);}
for(const dir of ['.','apps/api','apps/web','apps/ops','apps/worker','packages/ui','packages/config','packages/contracts','packages/database','packages/test-support']){const pkg=JSON.parse(fs.readFileSync(dir+'/package.json','utf8'));for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies})){if(version.startsWith('workspace:'))continue;if(manifest[name]?.version!==version)throw Error(`Package pin differs from manifest: ${name} ${version}`);}}
fs.writeFileSync('docs/adr/service-licenses.json',JSON.stringify(serviceLicenses,null,2)+'\n');console.log(`Licenses verified: ${Object.keys(manifest).length} packages and ${Object.keys(images).length} services`);
const processing=validateProcessingLicenses();console.log(`Processing licenses verified: ${processing.packages} pinned packages; ${processing.models} enabled models; GPU ${processing.gpu?'enabled':'unavailable'}`);
