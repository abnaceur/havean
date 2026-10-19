import fs from 'node:fs';

// Serialized into the generated development theme; credentials never enter tracked assets.
function accountButtons(accounts,password){
 const show=()=>{
  const form=document.querySelector('#kc-form-login'),username=document.querySelector('#username'),input=document.querySelector('#password');
  if(!form||!username||!input||document.querySelector('#haven-development-login'))return;
  const panel=document.createElement('section');panel.id='haven-development-login';panel.setAttribute('aria-label','Development test accounts');
  const heading=document.createElement('h2');heading.textContent='Development test accounts';panel.append(heading);
  const note=document.createElement('p');note.textContent='Choose a test account to sign in. One-time codes are skipped in development.';panel.append(note);
  const buttons=document.createElement('div');buttons.className='haven-persona-buttons';
  for(const account of accounts){const button=document.createElement('button');button.type='button';button.textContent='Sign in as '+account;button.addEventListener('click',()=>{username.value=account;input.value=password;form.requestSubmit();});buttons.append(button);}
  panel.append(buttons);form.after(panel);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show);else show();
}

export function generateDevelopmentLogin(generated,env,accounts){
 const root=generated+'/themes';
 // Remove stale development credentials if this setup is reused outside development.
 // Keep the bind-mounted directory itself stable when setup runs on a live stack.
 fs.mkdirSync(root,{recursive:true});
 fs.cpSync(new URL('../infra/themes/haven',import.meta.url),root+'/haven',{recursive:true});
 const assets=root+'/haven/login/resources/brand';fs.mkdirSync(assets,{recursive:true});
 for(const name of ['haven-wordmark.svg','haven-wordmark-dark.svg','haven-interior-v2.webp','font-0.ttf','font-1.ttf','space-grotesk-0.ttf','space-grotesk-1.ttf','DM-Sans-OFL.txt','Space-Grotesk-OFL.txt'])fs.copyFileSync(new URL('../apps/web/public/brand/'+name,import.meta.url),assets+'/'+name);
 if(env.NODE_ENV!=='development'||!env.DEV_PASSWORD){fs.rmSync(root+'/haven-development',{recursive:true,force:true});return 'haven';}
 const login=root+'/haven-development/login';fs.mkdirSync(login+'/resources/js',{recursive:true});fs.mkdirSync(login+'/resources/css',{recursive:true});
 fs.writeFileSync(login+'/theme.properties','parent=haven\nimport=common/keycloak\ndarkMode=false\nscripts=js/haven-auth.js js/development-accounts.js\nstyles=css/styles.css css/haven-auth.css css/development-accounts.css\n');
 fs.writeFileSync(login+'/resources/js/development-accounts.js',`(${accountButtons.toString()})(${JSON.stringify(accounts)},${JSON.stringify(env.DEV_PASSWORD)});\n`);
 fs.writeFileSync(login+'/resources/css/development-accounts.css','#haven-development-login{margin-top:28px;padding:20px;border:1px dashed #c9d3c7;border-radius:12px;background:#f5f7f2}#haven-development-login h2{font-family:inherit;font-size:14px;font-weight:500;margin:0 0 8px}#haven-development-login p{font-size:12px;line-height:1.6;color:#616e67;margin:0 0 14px}.haven-persona-buttons{display:flex;flex-wrap:wrap;gap:8px}.haven-persona-buttons button{min-height:44px;padding:8px 12px;border:1px solid #c9d3c7;border-radius:7px;background:white;color:#263529;font:inherit;font-size:12px;cursor:pointer}.haven-persona-buttons button:hover{background:#eef3e7}.haven-persona-buttons button:focus-visible{outline:3px solid #426318;outline-offset:2px}\n');
 return 'haven-development';
}
