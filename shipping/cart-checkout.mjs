import {createHmac,timingSafeEqual} from 'node:crypto';
import {shippingRuntime} from './runtime.mjs';
import {checkoutCoordinator} from './checkout-state.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>'$'+(c/100).toFixed(2);
const recoverableShippingErrors=new Set(['SHIPPING_REVIEW_PENDING','ADDRESS_REQUIRED','ADDRESS_OUTSIDE_SCOPE','CONTACT_REQUIRED','CONTACT_INVALID','FAMILY_UNSUPPORTED','NATIVE_PACKAGE_UNSUPPORTED','PRODUCT_SIZE_UNVERIFIED','PRODUCT_AMBIGUOUS','DELIVERY_REQUIRED','DELIVERY_CONFLICT','MIXED_DELIVERY','PICKUP_LOCATION_INVALID','HELD_STOCK_RELEASE_REQUIRED','RIGID_PICKUP_ONLY','CART_INVALID']);
function reviewNotice(review){
  if(!review)return '';
  const followUp=review.id?'Your shipping request is saved for review. Recheck shipping after the amount is confirmed.':'Check the order and delivery details above, or contact us for help.';
  return `<div role="${review.id?'status':'alert'}"><p>${esc(review.message)}</p><p>${followUp} <a href="tel:+16194650055">Call (619) 465-0055</a>.</p></div>`;
}
export function cartCheckout({base,key,read,write,buildDraftInput,transport,verifyPrepared,onReady,previewOnly=false,now=Date.now,opsPath}){
  const shipping=shippingRuntime({key,now,buildDraftInput,opsPath}),coordinator=checkoutCoordinator({read,write,shipping,transport,verifyPrepared,now});
  const csrf=id=>createHmac('sha256',key).update('cart-shipping:'+id).digest('hex');
  const equal=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const origins=new Set([new URL(base).origin,'https://recognition-direct.com','https://www.recognition-direct.com']);
  function checked(c){try{return shipping.checked(c);}catch{return null;}}
  function panel(c){
    if(c.checkoutAttempt&&['creating','needs-review','ready'].includes(c.checkoutAttempt.state))return '<section class="shipping-panel"><h2>Checkout status</h2><p>A checkout attempt is already saved. Check its status before trying again. Your cart is preserved.</p></section>';
    const q=checked(c),d=q?.destination??c.shippingAddressEntry??{},contact=q?.contact??c.shippingContactEntry??{email:c.items[0]?.draftInput?.email??''};
    const pickup=c.items.every(i=>i.draftInput.tags?.some(t=>t.startsWith('pickup-')));
    const field=(label,k,value,required=false,type='text')=>`<label>${label}<input name="${k}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="200"></label>`;
    return `<section class="shipping-panel"><h2>Contact and delivery</h2>${reviewNotice(c.shippingReview)}<p>Order as a guest. Company and phone are optional.</p><form id="rd-shipping-form" method="post" action="${base}/api/custom-order-cart/shipping-estimate?cart=${c.id}"><input type="hidden" name="shipping_csrf" value="${csrf(c.id)}"><div class="shipping-fields">${field('Contact name','name',contact.name,true)}${field('Email for your order and PDF proof','email',contact.email,true,'email')}${field('Company (optional)','company',contact.company)}${field('Phone (optional)','phone',contact.phone,false,'tel')}${pickup?'<p>Pickup selected. Confirm your contact details below.</p>':field('Street address','address1',d.address1,true)+field('Apartment / suite (optional)','address2',d.address2)+field('City','city',d.city,true)+field('State','provinceCode',d.provinceCode,true)+field('ZIP code','zip',d.zip,true)}<input type="hidden" name="countryCode" value="US"></div><button class="button" type="submit">${pickup?'Confirm pickup details':'Calculate shipping'}</button></form>${q?`<p role="status"><b>${pickup?'Pickup':'Standard shipping'}: ${money(q.result.shippingCents)}</b></p><p>Review shipping again if you change your cart or delivery details.</p>`:'<p>Confirm shipping or pickup before continuing to secure checkout.</p>'}<p class="small">Shipping estimates use Shopify rates from Spring Valley. No added markup or handling fee. Tax is calculated in Shopify.</p></section><script>document.addEventListener('DOMContentLoaded',()=>{document.getElementById('rd-shipping-form')?.addEventListener('input',()=>{for(const f of document.querySelectorAll('form[action*="/api/custom-order-cart/checkout"]')){const q=f.querySelector('[name="quote_id"]');if(q)q.value='';for(const b of f.querySelectorAll('button[type="submit"]'))b.disabled=true;}});});</script>`;
  }
  const css='.shipping-panel{border:1px solid #d8deea;border-radius:8px;padding:20px;margin:24px 0}.shipping-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}.shipping-fields label{display:flex;flex-direction:column;gap:7px;font-weight:600}.shipping-fields input{font:inherit;padding:12px;border:1px solid #aabbce;border-radius:4px;min-width:0}.shipping-panel .small{font-size:13px}@media(max-width:700px){.shipping-fields{grid-template-columns:1fr}}';
  function fields(c){const q=checked(c);return `<input type="hidden" name="shipping_csrf" value="${csrf(c.id)}"><input type="hidden" name="quote_id" value="${q?.id??''}">`;}
  async function form(req,id){
    if(!origins.has(req.headers.origin)||!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))throw Object.assign(new Error('Reload the cart and try again.'),{code:'SHIPPING_ORIGIN_REQUIRED',status:403});
    let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)throw Object.assign(new Error('Form too large.'),{status:413});}
    const f=new URLSearchParams(text);if(!equal(f.get('shipping_csrf'),csrf(id)))throw Object.assign(new Error('Reload the cart before continuing.'),{code:'SHIPPING_CSRF_REQUIRED',status:403});return f;
  }
  async function estimate(req,res,url){
    const id=url.searchParams.get('cart'),f=await form(req,id);
    await coordinator.exclusive(id,async()=>{const c=await read(id);if(!c||c.status!=='open')throw Object.assign(new Error('Reopen this cart.'),{status:409});
      const pickup=c.items.every(i=>i.draftInput.tags?.some(t=>t.startsWith('pickup-')));
      c.shippingContactEntry=Object.fromEntries(['name','email','company','phone'].map(k=>[k,f.get(k)??'']));c.shippingAddressEntry=pickup?{address1:'8680 Troy St.',city:'Spring Valley',provinceCode:'CA',zip:'91977',countryCode:'US'}:Object.fromEntries(['address1','address2','city','provinceCode','zip','countryCode'].map(k=>[k,f.get(k)??'']));
      delete c.shippingEstimatePreview;delete c.shippingReview;await write(c);try{c.shippingEstimatePreview=shipping.quote(c,c.shippingAddressEntry,c.shippingContactEntry);}catch(e){if(!recoverableShippingErrors.has(e.code))throw e;c.shippingReview={...(e.reviewId?{id:e.reviewId}:{}),message:e.message,code:e.code};}await write(c);
    });res.writeHead(303,{Location:base+'/custom-order-cart?cart='+id,'Cache-Control':'no-store'});res.end();
  }
  async function checkout(req,res,url){
    const id=url.searchParams.get('cart'),f=await form(req,id),result=await coordinator.checkout(id,f.get('quote_id'),{previewOnly});
    if(previewOnly){
      if(f.get('format')==='json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;}
      const q=result.snapshot;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private integrated checkout review</title><main style="font:16px/1.6 Arial;max-width:800px;margin:40px auto;padding:20px"><h1>Integrated checkout review</h1><p>Private test: no Shopify draft, order or payment was created.</p><p>Shipping: <b>${money(q.result.shippingCents)}</b></p><p>${esc(q.destination.city)}, ${esc(q.destination.provinceCode)} ${esc(q.destination.zip)}</p><ul>${result.input.lineItems.map(l=>`<li>${l.quantity} × ${esc(l.title)}</li>`).join('')}</ul><p>PDF proof approval is required before production.</p><a href="/custom-order-cart?cart=${id}">Back to your cart</a></main>`);return;
    }
    if(onReady)await onReady(id,result.result);
    res.writeHead(303,{Location:result.result.invoiceUrl,'Cache-Control':'no-store'});res.end();
  }
  return {shipping,coordinator,checked,panel,fields,css,estimate,checkout,line(c){try{return shipping.shippingLine(c);}catch{return null;}}};
}
