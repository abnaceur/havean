import fs from 'node:fs';
import {expect,it} from 'vitest';
import {validateScreens,validateTokens} from '../../scripts/reference-validation.mjs';
it('U01 reference manifest has valid states, labels and capture file references',()=>{expect(validateScreens(JSON.parse(fs.readFileSync('docs/reference/screens.json','utf8')))).toBeGreaterThan(40);});
it('U01 cannot claim visual parity with a missing capture',()=>{const row=JSON.parse(fs.readFileSync('docs/reference/screens.json','utf8'))[0];expect(()=>validateScreens([{...row,parityStatus:'verified'}])).toThrow('Unproven visual verification');});
it('U02 token values trace to proposals and unmeasured values cannot be verified',()=>{const tokens=JSON.parse(fs.readFileSync('docs/reference/tokens.json','utf8'));expect(validateTokens(tokens)).toBeGreaterThan(10);expect(()=>validateTokens({ink:{value:'#000',source:'test',evidenceLabel:'O'}})).toThrow('Unmeasured verified token');});
