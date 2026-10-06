import {it,expect} from 'vitest';
import fs from 'node:fs';
import {validateExactParity,validateScreens} from '../../scripts/reference-validation.mjs';
const screens=JSON.parse(fs.readFileSync('docs/reference/screens.json','utf8'));
it('Q02 exact parity refuses every unresolved required original capture',()=>{expect(validateScreens(screens)).toBeGreaterThan(40);expect(()=>validateExactParity(screens)).toThrow('Exact parity remains unverified');for(const row of screens.filter((s:any)=>s.evidenceLabel!=='P'))expect(()=>validateExactParity([{...row,parityStatus:'verified'}])).toThrow();});
it('Q02 proposals and an empty manifest cannot create an exact-parity signoff',()=>{expect(()=>validateExactParity([])).toThrow('No required reference captures');expect(()=>validateExactParity(screens.filter((s:any)=>s.evidenceLabel==='P'))).toThrow('No required reference captures');});
