import '../support/env';
import {expect,it} from 'vitest';
import {scanFile} from '../../apps/api/src/inventory/scanner';
it('HE-B04 real ClamAV rejects the standard antivirus fixture while accepting clean bounded source bytes',async()=>{
 await scanFile(Buffer.from('Synthetic clean private source inspection fixture'));
 const signature=['X5O!P%@AP[4','\\PZX54(P^)7CC)7}$','EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
 await expect(scanFile(Buffer.from(signature))).rejects.toMatchObject({status:400,response:{code:'UNSAFE_FILE',message:'The upload failed the malware scan'}});
},60000);
