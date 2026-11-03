(() => {
  const data=document.querySelector('#rd-award-pilot-data');
  const root=document.querySelector('.rd-award-pilot');
  if(!data||!root)return;
  const options=JSON.parse(data.textContent);
  const params=new URLSearchParams(window.location.search);
  let selected=options.find(o=>o.sku===params.get('sku'))||options[0];
  const cart=params.get('cart');
  function draw(){
    const image=root.querySelector('[data-pilot-image]');image.src=selected.image;image.alt=selected.title;
    root.querySelector('[data-pilot-current]').textContent=selected.title;
    root.querySelector('[data-pilot-price]').replaceChildren(document.createTextNode('$'+selected.price.toFixed(2)+' '));
    const label=document.createElement('span');label.textContent='each at quantity 1';root.querySelector('[data-pilot-price]').append(label);
    const target=new URL('https://checkout.recognition-direct.com/acrylic-awards');target.searchParams.set('sku',selected.sku);
    if(cart&&/^[a-f0-9-]{36}$/i.test(cart))target.searchParams.set('cart',cart);
    root.querySelector('[data-pilot-order]').href=target.href;
    root.querySelectorAll('[data-pilot-select]').forEach(a=>a.setAttribute('aria-current',String(a.dataset.pilotSelect===selected.sku)));
    root.querySelectorAll('[data-pilot-sku]').forEach(row=>row.classList.toggle('is-selected',row.dataset.pilotSku===selected.sku));
    if(cart&&/^[a-f0-9-]{36}$/i.test(cart))root.querySelectorAll('a[href^="https://checkout.recognition-direct.com/acrylic-awards"]').forEach(a=>{const link=new URL(a.href);link.searchParams.set('cart',cart);a.href=link.href;});
  }
  root.querySelectorAll('[data-pilot-select]').forEach(a=>a.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();selected=options.find(o=>o.sku===a.dataset.pilotSelect);
    const url=new URL(window.location.href);url.searchParams.set('sku',selected.sku);url.hash='';history.replaceState(null,'',url);draw();
  }));
  draw();
})();
