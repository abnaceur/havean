import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),name=process.argv[2];
if(!['api','worker','config','contracts','database'].includes(name))throw new Error('Choose a runtime app or package');
const isApp=['api','worker'].includes(name),app=path.join(root,isApp?'apps':'packages',name),out=path.join(app,'dist');
const parsed=ts.getParsedCommandLineOfConfigFile(path.join(app,'tsconfig.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw new Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});
const packages=['config','contracts','database'],roots=isApp||name==='contracts'?parsed.fileNames:[path.join(app,'src/index.ts'),...(name==='database'?[path.join(app,'src/migrate.ts')]:[])];
const options={...parsed.options,noEmit:false,rootDir:isApp?root:path.join(app,'src'),outDir:out,incremental:false};
const program=ts.createProgram(roots,options),diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exit(1);}
fs.rmSync(out,{recursive:true,force:true});
const emitted=program.emit();if(emitted.emitSkipped)throw new Error('Runtime emit failed');
const exports=new Map();
for(const pkg of packages){const manifest=JSON.parse(fs.readFileSync(path.join(root,'packages',pkg,'package.json')));for(const [key,value] of Object.entries(manifest.exports)){const source=typeof value==='string'?value:value.types;if(!source)throw new Error('Source export is missing');const spec='@haven/'+pkg+(key==='.'?'':key.slice(1));exports.set(spec,path.join(root,'packages',pkg,source.replace(/^\.\/src\//,'dist/').replace(/\.tsx?$/,'.js')));}}
if(name==='database'){const source=path.join(app,'src/seed.ts'),seed=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:options,fileName:source,reportDiagnostics:true});if(seed.diagnostics?.length)throw Error('Seed syntax compilation failed');fs.writeFileSync(path.join(out,'seed.js'),seed.outputText);}
let count=0;
function rewrite(file){const text=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];const visit=node=>{let literal;if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))literal=node.moduleSpecifier;if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))literal=node.arguments[0];if(literal){let spec=literal.text,target=exports.get(spec);if(spec.startsWith('@haven/')&&!target)throw new Error('Unknown workspace export '+spec);if(target){spec=path.relative(path.dirname(file),target).split(path.sep).join('/');if(!spec.startsWith('.'))spec='./'+spec;}else if(spec.startsWith('.')){target=path.resolve(path.dirname(file),spec);if(!path.extname(spec)){if(fs.existsSync(target+'.js'))spec+='.js';else if(fs.existsSync(path.join(target,'index.js')))spec+='/index.js';else throw new Error('Unresolved emitted import '+spec);target=path.resolve(path.dirname(file),spec);}}if(target&&!fs.existsSync(target))throw new Error('Missing compiled module '+target);if(spec!==literal.text)edits.push({start:literal.getStart(source),end:literal.end,text:JSON.stringify(spec)});}ts.forEachChild(node,visit);};visit(source);let result=text;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);fs.writeFileSync(file,result);count++;}
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name.endsWith('.js'))rewrite(file);}}walk(out);
if(isApp){const emittedApps=path.join(out,'apps');for(const sibling of fs.readdirSync(emittedApps)){const directory=path.join(emittedApps,sibling),dependencies=path.join(root,'apps',sibling,'node_modules');if(fs.existsSync(dependencies))fs.symlinkSync(path.relative(directory,dependencies),path.join(directory,'node_modules'),'dir');}}
console.log(JSON.stringify({event:'runtime.compiled',app:name,files:count,workspaceSourceImports:false}));
