import {validateDigitizationTasks} from './lib/digitization-tasks.mjs';
const index=process.argv.indexOf('--root');
const result=validateDigitizationTasks({root:index===-1?process.cwd():process.argv[index+1],release:process.argv.includes('--release'),write:process.argv.includes('--write')});
if(result.errors.length){console.error(result.errors.join('\n'));process.exitCode=1;}
else console.log(`Validated ${result.count} digitization tasks; ${result.done} done.`);
