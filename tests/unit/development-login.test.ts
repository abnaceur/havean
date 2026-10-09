import {test,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Bootstrap scripts are native JavaScript.
import {generateDevelopmentLogin} from '../../scripts/development-login.mjs';

test('development login assets are removed when setup switches to production or test',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haven-login-'));
 try{
  expect(generateDevelopmentLogin(root,{NODE_ENV:'development',DEV_PASSWORD:'fixture-password'},['buyer'])).toBe('haven-development');
  expect(fs.readFileSync(root+'/themes/haven-development/login/resources/js/development-accounts.js','utf8')).toContain('fixture-password');
  const mountedDirectory=fs.statSync(root+'/themes').ino;
  generateDevelopmentLogin(root,{NODE_ENV:'development',DEV_PASSWORD:'rotated-fixture'},['buyer']);
  expect(fs.statSync(root+'/themes').ino).toBe(mountedDirectory);
  expect(fs.readFileSync(root+'/themes/haven-development/login/resources/js/development-accounts.js','utf8')).toContain('rotated-fixture');
  for(const mode of ['production','test',undefined]){
   expect(generateDevelopmentLogin(root,{NODE_ENV:mode,DEV_PASSWORD:'fixture-password'},['buyer'])).toBe('');
   expect(fs.readdirSync(root+'/themes')).toEqual([]);
  }
  expect(generateDevelopmentLogin(root,{NODE_ENV:'development'},['buyer'])).toBe('');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
