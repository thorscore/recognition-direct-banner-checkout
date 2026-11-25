export const PRODUCT = '15411785826600';
export const THEME = '192167510312';
export const MARKER = 'rd-20oz-private-20261124';
export const APP = 'https://checkout.recognition-direct.com';
const utf8 = new TextEncoder();
const crcTable = Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes) { let crc=0xffffffff; for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function productionFilename(name,fallback='upload') {
  const last=String(name||'').replaceAll('\\','/').split('/').at(-1).normalize('NFC').replace(/[\u0000-\u001f<>:"|?*]/g,'_').slice(0,160);
  return !last||/^\.+$/.test(last)?fallback:last;
}
export function storedZip(entries) {
  const chunks=[],central=[];let offset=0,centralSize=0;
  for(const entry of entries) {
    const name=utf8.encode(entry.path),bytes=entry.bytes,crc=crc32(bytes);
    if(name.length>65535||bytes.length>20*1024*1024)throw Error('Production file is too large for this private test.');
    const head=new Uint8Array(30+name.length),view=new DataView(head.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,0x21,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);head.set(name,30);
    chunks.push(head,bytes);
    const index=new Uint8Array(46+name.length),v=new DataView(index.buffer);
    v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);v.setUint32(16,crc,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);index.set(name,46);central.push(index);centralSize+=index.length;offset+=head.length+bytes.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  const blob=new Blob([...chunks,...central,end],{type:'application/zip'});
  if(blob.size>20*1024*1024)throw Error('Combined original files must be under 20 MB for this private test.');
  return blob;
}
export async function buildProductionPack({configurationId,variantId,sku,color,quantity,unitCents,personalization='',notes='',artwork,nameList,limitedLaunch=false}) {
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(configurationId)||!/^\d+$/.test(String(variantId))||!Number.isSafeInteger(quantity)||quantity<1||quantity>4||!Number.isSafeInteger(unitCents)||unitCents<=0)throw Error('Invalid private production configuration.');
  const entries=[],files=[];
  for(const [role,file] of [['logo',artwork],['name-list',nameList]])if(file?.size>0) {
    const bytes=new Uint8Array(await file.arrayBuffer()),path='originals/'+role+'/'+productionFilename(file.name);
    entries.push({path,bytes});files.push({role,path,originalName:file.name,bytes:bytes.length,sha256:await sha256(bytes)});
  }
  const manifest={schema:limitedLaunch?'rd-tumbler-production-v1':'rd-private-tumbler-production-v1',privatePreview:!limitedLaunch,...(limitedLaunch?{limitedLaunch:'20oz-v1'}:{}),proofRequired:true,productionReleaseAllowed:false,configurationId,savedConfiguration:APP+'/custom-order-cart?cart='+configurationId,productId:PRODUCT,variantId:String(variantId),sku,color,quantity,unitCents,personalization,notes,files};
  entries.push({path:'production-manifest.json',bytes:utf8.encode(JSON.stringify(manifest,null,2)+'\n')});
  entries.push({path:'READ-ME.txt',bytes:utf8.encode((limitedLaunch?'PROOF APPROVAL REQUIRED.\n':'PRIVATE TEST — DO NOT PRODUCE.\n')+'Original artwork is inside originals/. Individual Shopify image attachments may be re-encoded.\nCheck payment and proof approval in Shopify before any real production.\nThis package does not approve a proof, release production, or confirm payment.\n')});
  const zip=storedZip(entries),file=new File([zip],limitedLaunch?'RD-production-originals.zip':'RD-private-production-originals.zip',{type:'application/zip'});
  return {file,manifest,sha256:await sha256(await file.arrayBuffer())};
}
const STORAGE = 'rdTumbler20ozNativeV1';
let liveFlow=false;
export function previewThemeAllowed(theme) { return String(theme?.id) === THEME && String(theme?.role).toLowerCase() === 'unpublished'; }
export function launchAllowed(theme,sectionEnabled,status){return String(theme?.role).toLowerCase()==='main'&&sectionEnabled===true&&status?.enabled===true&&status.productId===PRODUCT&&status.version==='20oz-v1';}
export function ownedLine(line) { return line?.properties?._rd_tumbler_preview === MARKER; }
export function eligibleCart(cart, {empty = false,production = false} = {}) {
  if (cart?.currency !== 'USD' || !Array.isArray(cart?.items)) return {ok:false,reason:'Currency or cart unavailable.'};
  if (!cart.items.length) return {ok:empty,units:0,reason:'Your private cart is empty.'};
  let units = 0;
  for (const line of cart.items) {
    if (!ownedLine(line) || String(line.product_id) !== PRODUCT || !Number.isSafeInteger(line.quantity) || line.quantity < 1) return {ok:false,reason:'This cart contains items outside the private tumbler preview. They have not been changed. Use regular ordering for this cart.'};
    if(production&&(!/^https:\/\/cdn\.shopify\.com\//.test(line.properties['Production originals']||'')||!/^[a-f0-9]{64}$/.test(line.properties._rd_original_pack_sha256||'')))return {ok:false,reason:'This earlier preview item needs its original production files attached. Remove the preview tumblers and add them again with the updated private form.'};
    units += line.quantity;
  }
  return units <= 4 ? {ok:true,units} : {ok:false,reason:'The private preview covers up to four tumblers. Use regular ordering for larger quantities.'};
}
export function validQuote(quote, count, nativeUnitCents) {
  return Number.isSafeInteger(count) && count >= 1 && count <= 4 && Number.isSafeInteger(nativeUnitCents) && nativeUnitCents > 0 && Math.round(quote?.unitPrice * 100) === nativeUnitCents && Math.round(quote?.totalPrice * 100) === nativeUnitCents * count;
}
export function cartDestination(root = '/') { return root + 'cart?view=rd-tumbler-launch'+(previewThemeAllowed(globalThis.Shopify?.theme)?'&preview_theme_id='+THEME:''); }
const uuid = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value || '');
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents / 100);
const nonemptyFile = file => file && file.name && file.size > 0;
async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {...options, cache:'no-store'});
  const result = await response.json();
  if (!response.ok) throw new Error(result.description || result.error || result.message || 'Unable to update the private cart.');
  return result;
}
function setStatus(root, message, bad = false) {
  const box = root.querySelector(bad ? '[data-error]' : '[data-cart-status]');
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}
function cartId() { try { return sessionStorage.getItem(STORAGE) || ''; } catch { return ''; } }
function saveCartId(id) { if (!uuid(id)) throw new Error('Unable to save the production configuration.'); try { sessionStorage.setItem(STORAGE,id); } catch {} }
function linkHeader(root) {
  const header = document.querySelector('#cart-icon-bubble');
  if (header) header.href = cartDestination(root);
}
async function removeSubmission(routes, nonce) {
  const cart = await jsonFetch(routes + 'cart.js');
  for (const line of cart.items.filter(line => line.properties?._rd_preview_submission === nonce)) {
    await jsonFetch(routes + 'cart/change.js', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:line.key,quantity:0})});
  }
}
function formFingerprint(data) {
  return JSON.stringify([...data.entries()].map(([key,value]) => [key, typeof value === 'string' ? value : [value.name,value.size,value.lastModified]]));
}
async function initProduct(root, routes) {
  const form = root.querySelector('[data-drinkware-form]');
  const button = form.querySelector('[type=submit]');
  const color = root.querySelector('[data-color]');
  const count = form.elements.order_quantity;
  const image = root.querySelector('.rd-drinkware__image');
  const unit = root.querySelector('[data-unit-price]');
  const total = root.querySelector('[data-total-price]');
  const message = root.querySelector('[data-price-message]');
  const cartLink = root.querySelector('[data-custom-cart-link]');
  let pending, timer, quote, priceValid = false, submitting = false, cachedSave;
  const currentOption = () => color.options[color.selectedIndex];
  const selectedId = () => String(currentOption().dataset.variantId);
  const unitCents = () => Number(currentOption().dataset.price);
  cartLink.href = cartDestination(routes);
  cartLink.hidden = false;
  linkHeader(routes);
  count.max = '4';
  form.action = routes + 'cart/add.js';
  async function checkPrice() {
    pending?.abort();
    const controller = new AbortController(); pending = controller; priceValid = false; button.disabled = true;
    setStatus(root,'',true);
    const quantity = Number(count.value);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 4) { message.textContent = 'This private preview covers one to four tumblers. Larger orders keep the regular ordering flow.'; return; }
    message.textContent = 'Checking current price…';
    const data = new FormData(); data.set('sku',color.value); data.set('order_quantity',String(quantity));
    try {
      const result = await jsonFetch(APP + '/api/polar-camel-price',{method:'POST',body:data,signal:controller.signal});
      if (pending !== controller) return;
      if (!validQuote(result,quantity,unitCents())) throw new Error('The configured price differs from the Shopify price. Your cart has not been changed. Use regular ordering while we review it.');
      quote = result; priceValid = true; unit.textContent = money(unitCents()); total.textContent = money(Math.round(result.totalPrice*100));
      message.textContent = 'Current product price confirmed. Live shipping or free pickup is selected at checkout. No shipping markup or handling fee.';
      button.disabled = submitting;
    } catch (error) { if (error.name !== 'AbortError' && pending === controller) { message.textContent = 'Unable to confirm the current price.'; setStatus(root,error.message,true); } }
  }
  function changeColor() {
    const option = currentOption();
    if (option.dataset.image) { image.src = option.dataset.image; image.removeAttribute('srcset'); image.alt = root.querySelector('h1').textContent + ' — ' + option.textContent.split(' - ')[0]; }
    const url = new URL(location.href); url.searchParams.set('variant',selectedId()); history.replaceState({},'',url);
    unit.textContent = money(unitCents()); checkPrice();
  }
  color.addEventListener('change',changeColor);
  count.addEventListener('input',()=>{clearTimeout(timer);pending?.abort();priceValid=false;button.disabled=true;timer=setTimeout(checkPrice,200);});
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (!priceValid || submitting || !form.reportValidity()) return;
    if (!form.elements.personalization_text.value.trim() && !nonemptyFile(form.elements.artwork.files[0]) && !nonemptyFile(form.elements.personalization_file.files[0])) { setStatus(root,'Add personalization, a logo or a name list.',true); return; }
    submitting = true; button.disabled = true; button.textContent = 'Saving design and adding to cart…'; setStatus(root,'',true);
    let nonce;
    try {
      const before = await jsonFetch(routes + 'cart.js'); const scope = eligibleCart(before,{empty:true});
      if (!scope.ok) throw new Error(scope.reason);
      const quantity = Number(count.value); if (scope.units + quantity > 4) throw new Error('This private cart can contain at most four tumblers. No items were changed.');
      if (!validQuote(quote,quantity,unitCents())) throw new Error('Please confirm the current price again.');
      const artwork=form.elements.artwork.files[0],names=form.elements.personalization_file.files[0];
      if((artwork?.size||0)+(names?.size||0)>19*1024*1024)throw new Error('Keep combined original uploads under 19 MB for this private test. Your cart has not been changed.');
      const data = new FormData(form); const fingerprint = formFingerprint(data);
      if (!cachedSave || cachedSave.fingerprint !== fingerprint) {
        const url = new URL(APP + '/api/polar-camel-checkout'); const savedId = cartId(); if (uuid(savedId)) url.searchParams.set('cart',savedId);
        const originalNotes = String(data.get('notes') || ''); data.set('notes',originalNotes + (liveFlow?'\nRD 20 OZ NATIVE CHECKOUT V1 — PROOF REQUIRED.':'\nPRIVATE SHIPPING PREVIEW — DO NOT PAY OR PRODUCE.'));if(liveFlow)data.set('rd_tumbler_flow','20oz-v1');
        const saved = await jsonFetch(url.href,{method:'POST',body:data,headers:{Accept:'application/json','X-Requested-With':'fetch'},credentials:'omit'});
        if (!uuid(saved.cartId) || !uuid(saved.savedRecordId) || !uuid(saved.savedCartItemId)) throw new Error('The private production connection is not ready. No checkout item was added.');
        saveCartId(saved.cartId); cachedSave = {fingerprint,cartId:saved.cartId,recordId:saved.savedRecordId,cartItemId:saved.savedCartItemId,nonce:crypto.randomUUID()};
      }
      nonce = cachedSave.nonce;
      const fresh = await jsonFetch(routes + 'cart.js');
      if (!fresh.items.some(line=>line.properties?._rd_preview_submission===nonce)) {
        setStatus(root,'Keeping original artwork and preparing production details…');
        const pack=await buildProductionPack({configurationId:cachedSave.cartId,variantId:selectedId(),sku:color.value,color:currentOption().textContent.split(' - ')[0],quantity,unitCents:unitCents(),personalization:form.elements.personalization_text.value.trim(),notes:(form.elements.notes?.value||'').trim(),artwork,nameList:names,limitedLaunch:liveFlow});
        const add = new FormData(); add.set('id',selectedId()); add.set('quantity',String(quantity));
        const values = {
          _rd_tumbler_preview:MARKER,_rd_preview_submission:nonce,...(liveFlow?{_rd_tumbler_release:'20oz-v1'}:{}),
          ...(liveFlow?{}:{'Private preview':'Do not pay or produce'}),SKU:color.value,'Proof Required':'Yes',
          'Personalization Text':form.elements.personalization_text.value.trim(),
          'Company':form.elements.company?.value || '', 'Phone':form.elements.phone?.value || '',
          'Need-by Date':form.elements.need_by?.value || '',Notes:(form.elements.notes?.value || '').trim(),
          'Delivery preference':form.elements.delivery_method.value === 'ship' ? 'Ship — select UPS Ground at checkout' : 'Pickup at 8680 Troy St., Spring Valley',
          _rd_custom_cart_id:cachedSave.cartId,
          _rd_configuration_id:cachedSave.recordId,_rd_cart_item_id:cachedSave.cartItemId,
          _rd_saved_configuration:APP + '/custom-order-cart?cart=' + cachedSave.cartId,
          _rd_original_pack_sha256:pack.sha256,
          'Production hold':liveFlow?'Proof approval required before production':'Private test — unpaid; proof approval required; do not produce',
        };
        for (const [key,value] of Object.entries(values)) if(value) add.set('properties['+key+']',value);
        if (nonemptyFile(artwork)) add.set('properties[Logo / Artwork]',artwork);
        if (nonemptyFile(names)) add.set('properties[Personalization File]',names);
        add.set('properties[Production originals]',pack.file);
        try { await jsonFetch(routes+'cart/add.js',{method:'POST',body:add}); }
        catch(error) { const retry = await jsonFetch(routes+'cart.js'); if(!retry.items.some(line=>line.properties?._rd_preview_submission===nonce)) throw error; }
      }
      const after = await jsonFetch(routes+'cart.js'); const result = eligibleCart(after,{production:true});
      const inserted = after.items.find(line=>line.properties?._rd_preview_submission===nonce);
      if (!result.ok || !inserted || inserted.original_price !== unitCents() || inserted.quantity !== quantity || inserted.original_line_price !== quantity*unitCents()) { await removeSubmission(routes,nonce); throw new Error(result.reason || 'The Shopify item or price changed. Only this attempted addition was removed; existing items were preserved.'); }
      setStatus(root,'Design saved. Your real tumbler is in the private cart.');
      location.assign(cartDestination(routes));
    } catch(error) { setStatus(root,error.message || 'Unable to add the item. No order was placed.',true); }
    finally { submitting = false; button.textContent = 'Add to Cart'; button.disabled = !priceValid; }
  });
  changeColor();
}
async function initCart(root,routes) {
  linkHeader(routes);
  const checkout = root.querySelector('[data-native-checkout]');
  const clear = root.querySelector('[data-remove-preview]');
  const message = root.querySelector('[data-native-cart-status]');
  async function verify() { const cart = await jsonFetch(routes+'cart.js'); const result=eligibleCart(cart,{production:true});
    let ownerLink=root.querySelector('[data-private-proof-link]');if(!liveFlow){if(!ownerLink){ownerLink=document.createElement('a');ownerLink.dataset.privateProofLink='';ownerLink.textContent='Open private proof preview';ownerLink.style.display='block';ownerLink.style.marginTop='16px';checkout.insertAdjacentElement('afterend',ownerLink);}
    const sources=cart.items.filter(ownedLine).map(line=>({cartId:line.properties._rd_custom_cart_id,recordId:line.properties._rd_configuration_id||'',variantId:String(line.variant_id),archiveUrl:line.properties['Production originals'],archiveHash:line.properties._rd_original_pack_sha256}));
    ownerLink.href=APP+'/private-tumbler/#sources='+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(sources)))));ownerLink.hidden=!result.ok;} checkout.disabled=!result.ok; message.textContent=result.ok?'Original production files are attached. Shipping and pickup are selected in secure Shopify checkout. No second quote is needed.':result.reason; return result; }
  await verify();
  checkout.addEventListener('click',async()=>{checkout.disabled=true;try{if((await verify()).ok)location.assign(routes+'checkout');}catch(error){message.textContent=error.message;}});
  clear.addEventListener('click',async()=>{clear.disabled=true;try{const cart=await jsonFetch(routes+'cart.js');for(const line of cart.items.filter(line=>ownedLine(line)&&String(line.product_id)===PRODUCT)){await jsonFetch(routes+'cart/change.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:line.key,quantity:0})});}try{sessionStorage.removeItem(STORAGE);}catch{}location.reload();}catch(error){message.textContent=error.message;clear.disabled=false;}});
}
if(typeof document!=='undefined')void(async()=>{
 const routes=window.Shopify?.routes?.root||'/',preview=previewThemeAllowed(window.Shopify?.theme);
 const formRoot=document.querySelector('[data-rd-native-tumbler-form]'),cartRoot=document.querySelector('[data-rd-native-tumbler-cart]'),root=formRoot||cartRoot;if(!root)return;
 let enabled=false;
 if(!preview){try{const status=await jsonFetch(APP+'/api/tumbler-native-status');enabled=launchAllowed(window.Shopify?.theme,root.dataset.launchEnabled==='true',status);}catch{}if(cartRoot&&!enabled&&String(window.Shopify?.theme?.role).toLowerCase()==='main'){const cart=await jsonFetch(routes+'cart.js');enabled=cart.items.length>0&&cart.items.every(l=>String(l.product_id)===PRODUCT&&l.properties?._rd_tumbler_release==='20oz-v1');}if(!enabled)return;liveFlow=true;}
 const shell=root.closest('[data-launch-shell]');if(shell){shell.querySelector('[data-launch-fallback]').hidden=true;shell.querySelector('[data-launch-candidate]').hidden=false;}
 if(liveFlow){for(const e of root.querySelectorAll('[data-preview-only]'))e.hidden=true;}
 if(formRoot)await initProduct(formRoot,routes);else await initCart(cartRoot,routes);
})().catch(error=>{const root=document.querySelector('[data-rd-native-tumbler-form],[data-rd-native-tumbler-cart]');if(root)setStatus(root,error.message,true);});
