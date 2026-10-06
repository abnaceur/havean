import fs from 'node:fs';
export function validateScreens(screens){
 const ids=new Set();
 for(const screen of screens){
  if(!screen.id||ids.has(screen.id))throw Error('Missing or duplicate reference state');ids.add(screen.id);
  if(!['O','R','P','V'].includes(screen.evidenceLabel)||!['unverified','verified','proposed','blocked'].includes(screen.parityStatus))throw Error('Invalid evidence or parity status: '+screen.id);
  if(!screen.localRoute?.startsWith('/')||!screen.viewport?.width||!screen.viewport?.height)throw Error('Missing route or viewport: '+screen.id);
  for(const field of ['referenceScreenshot','localScreenshot'])if(screen[field]&&!fs.existsSync(screen[field]))throw Error('Missing capture file: '+screen.id);
  if(screen.parityStatus==='verified'&&(!screen.referenceUrl||!screen.referenceScreenshot||!screen.localScreenshot||!screen.captureDate||!screen.measuredBoxes||!screen.typography||!screen.spacing||!screen.colors||!screen.approvedEnglishCopy))throw Error('Unproven visual verification: '+screen.id);
  if(screen.evidenceLabel==='P'&&screen.parityStatus==='verified')throw Error('Proposal cannot claim reference verification: '+screen.id);
 }
 return screens.length;
}
export function validateExactParity(screens){
 validateScreens(screens);
 const required=screens.filter(screen=>screen.evidenceLabel!=='P');
 if(!required.length)throw Error('No required reference captures');
 const gaps=required.filter(screen=>screen.evidenceLabel!=='O'||screen.parityStatus!=='verified'||!screen.referenceScreenshot||!screen.localScreenshot||!screen.captureDate||!screen.approvedEnglishCopy||!Object.keys(screen.measuredBoxes||{}).length||!Object.keys(screen.typography||{}).length||!Object.keys(screen.spacing||{}).length||!Object.keys(screen.colors||{}).length);
 if(gaps.length)throw Error('Exact parity remains unverified: '+gaps.map(screen=>screen.id).join(', '));
 for(const screen of required)for(const [name,box] of Object.entries(screen.measuredBoxes))for(const coordinate of ['x','y','width','height'])if(!Number.isFinite(box[coordinate]))throw Error('Unmeasured reference anchor: '+screen.id+'.'+name+'.'+coordinate);
 return required.length;
}
export function validateTokens(tokens){
 for(const [name,token] of Object.entries(tokens)){
  if(!token.value||!['P','O'].includes(token.evidenceLabel)||!token.source)throw Error('Untraceable token: '+name);
  if(token.evidenceLabel==='O'&&(!token.referenceScreenshot||!fs.existsSync(token.referenceScreenshot)||!token.measurement))throw Error('Unmeasured verified token: '+name);
 }
 return Object.keys(tokens).length;
}
if(process.argv[1]?.endsWith('reference-validation.mjs')){const screens=validateScreens(JSON.parse(fs.readFileSync('docs/reference/screens.json')));const tokens=validateTokens(JSON.parse(fs.readFileSync('docs/reference/tokens.json')));if(process.argv.includes('--exact'))validateExactParity(JSON.parse(fs.readFileSync('docs/reference/screens.json')));console.log(`Validated ${screens} reference states and ${tokens} traced tokens`);}
