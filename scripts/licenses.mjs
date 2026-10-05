import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('docs/adr/dependencies.json','utf8'));
for(const [name,entry] of Object.entries(manifest)){if(!entry.license||!entry.version)throw Error(`Missing license/version: ${name}`);}
const images=JSON.parse(fs.readFileSync('docs/adr/images.json','utf8'));
const serviceLicenses={'node':'MIT + third-party notices','postgis/postgis':'PostgreSQL AND GPL-2.0-or-later','quay.io/keycloak/keycloak':'Apache-2.0','getmeili/meilisearch':'MIT','valkey/valkey':'BSD-3-Clause','chrislusf/seaweedfs':'Apache-2.0','traefik':'MIT','axllent/mailpit':'MIT','clamav/clamav':'GPL-2.0-or-later'};
for(const image of Object.values(images)){if(!/@sha256:[a-f0-9]{64}$/.test(image))throw Error('Missing image digest: '+image);const repository=image.split(':')[0];if(!serviceLicenses[repository])throw Error('Missing service license: '+repository);}
for(const dir of ['.','apps/api','apps/web','apps/ops','apps/worker','packages/ui','packages/config','packages/contracts','packages/database','packages/test-support']){const pkg=JSON.parse(fs.readFileSync(dir+'/package.json','utf8'));for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies})){if(version.startsWith('workspace:'))continue;if(manifest[name]?.version!==version)throw Error(`Package pin differs from manifest: ${name} ${version}`);}}
fs.writeFileSync('docs/adr/service-licenses.json',JSON.stringify(serviceLicenses,null,2)+'\n');console.log(`Licenses verified: ${Object.keys(manifest).length} packages and ${Object.keys(images).length} services`);
