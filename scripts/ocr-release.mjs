import {validateOcrRelease} from './lib/ocr-release.mjs';
console.log(JSON.stringify(validateOcrRelease(process.cwd(),{verifyCache:process.argv.includes('--verify-cache')})));
