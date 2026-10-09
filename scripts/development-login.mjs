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
 if(env.NODE_ENV!=='development'||!env.DEV_PASSWORD){fs.rmSync(root+'/haven-development',{recursive:true,force:true});return '';}
 const login=root+'/haven-development/login';fs.mkdirSync(login+'/resources/js',{recursive:true});fs.mkdirSync(login+'/resources/css',{recursive:true});
 fs.writeFileSync(login+'/theme.properties','parent=keycloak.v2\nimport=common/keycloak\nscripts=js/development-accounts.js\nstyles=css/styles.css css/development-accounts.css\n');
 fs.writeFileSync(login+'/resources/js/development-accounts.js',`(${accountButtons.toString()})(${JSON.stringify(accounts)},${JSON.stringify(env.DEV_PASSWORD)});\n`);
 fs.writeFileSync(login+'/resources/css/development-accounts.css','#haven-development-login{margin-top:24px;padding-top:20px;border-top:1px solid #d2d2d2}#haven-development-login h2{font-size:18px;margin-bottom:8px}#haven-development-login p{margin-bottom:12px}.haven-persona-buttons{display:flex;flex-wrap:wrap;gap:8px}.haven-persona-buttons button{min-height:44px;padding:8px 12px;border:1px solid #0066cc;border-radius:4px;background:white;color:#004080;cursor:pointer}.haven-persona-buttons button:hover{background:#eef6ff}.haven-persona-buttons button:focus-visible{outline:3px solid #0066cc;outline-offset:2px}\n');
 return 'haven-development';
}
