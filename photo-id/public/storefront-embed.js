const photoOrigin='https://checkout.recognition-direct.com';
const photoRoute=hash=>typeof hash==='string'&&/^#(?:job|proof)=[a-f0-9]{32}$/.test(hash)?hash:'';
for(const frame of document.querySelectorAll('iframe[data-rd-photo-id]')){
 const source=new URL(frame.dataset.rdPhotoUrl);if(source.origin!==photoOrigin||source.pathname!=='/photo-id/')continue;
 source.hash=photoRoute(location.hash);frame.src=source.href;
 window.addEventListener('hashchange',()=>{const hash=photoRoute(location.hash);if(hash)frame.contentWindow.postMessage({type:'rd-photo-id-route',hash},photoOrigin);});
 window.addEventListener('message',event=>{
  if(event.origin!==photoOrigin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='rd-photo-id-height'){const height=event.data.height;if(Number.isFinite(height)&&height>=100&&height<=50000)frame.style.height=Math.max(620,Math.ceil(height)+4)+'px';}
  if(event.data?.type==='rd-photo-id-route'&&photoRoute(event.data.hash)&&location.hash!==event.data.hash)history.replaceState(null,'',location.pathname+location.search+event.data.hash);
 });
}
