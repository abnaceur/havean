import {execFileSync} from 'node:child_process';

// Resolve the fixed local investigation alias before running any audit code.
// Compose receives only that observed immutable ID; no credentials or network.
const alias=process.argv[2]??'haven-ocr-worker:3.3.3-clean-cpu-investigation-v1';
if(process.argv.length>3||!['haven-ocr-worker:3.3.3-clean-cpu-investigation-v1','haven-ocr-worker:3.3.3-clean-cpu-no-gui-investigation-v2'].includes(alias))throw Error('OCR_AUDIT_INVESTIGATION_ALIAS_REQUIRED');
const image=execFileSync('docker',['image','inspect',alias,'--format','{{.Id}}'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('OCR_AUDIT_IMMUTABLE_IMAGE_REQUIRED');
const output=execFileSync('docker',['compose','-p','haven-ocr-native-audit','-f','compose.ocr-audit.yaml','run','--rm','--no-deps','ocr-native-audit'],{encoding:'utf8',env:{...process.env,OCR_NATIVE_AUDIT_IMAGE_ID:image},stdio:['ignore','pipe','inherit'],maxBuffer:4*1024*1024});
const result=JSON.parse(output);
if(result.image!==image||result.productionEnabled!==false||result.status!=='installed-native-inventory-only')throw Error('OCR_AUDIT_RESULT_INVALID');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
