import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
it('shared integration project rejects a second run before touching Docker or evidence',()=>{
 // The test container has its own /tmp; this checks the real script's early
 // refusal and never acquires or resets the host's current integration stack.
 const result=spawnSync('flock',['-x','/tmp/haven-integration.lock','sh',path.join(process.cwd(),'test.sh')],{encoding:'utf8',timeout:5000});
 expect(result.status,result.stderr).toBe(1);
 expect(result.stderr).toContain('haven-integration is already in use');
 expect(result.stderr).not.toContain('docker:');
});
