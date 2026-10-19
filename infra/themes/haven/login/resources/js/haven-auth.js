// Add supporting copy without replacing identity-provider forms or validation.
function enhanceHavenAuth(){
 const title=document.querySelector('#kc-page-title');
 const copy={
  'login-login':'Welcome back. Pick up where you left off.',
  'login-register':'Find your place. Save your favourites. Make your move.',
  'login-login-reset-password':'Enter your username or email to request a reset link.'
 }[document.body.dataset.pageId];
 if(title&&copy){const intro=document.createElement('p');intro.className='haven-auth-intro';intro.textContent=copy;title.after(intro);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhanceHavenAuth);else enhanceHavenAuth();
