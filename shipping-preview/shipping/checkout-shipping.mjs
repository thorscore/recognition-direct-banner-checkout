import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {estimateCart,RATE_ORIGIN} from './estimate-engine.mjs';
import {planDrinkware} from './drinkware-planner.mjs';
import drinkwareCatalog from './drinkware-catalog.json' with {type:'json'};
const drinkwareVariants=new Map(drinkwareCatalog.map(p=>[p.variantId,p]));
const drinkwareSkus=new Map(drinkwareCatalog.map(p=>[p.sku,p]));
const catalog=new Set(['coroplast','foamcore','aluminum-sign','13oz-vinyl-banner','adhesive-window-perf','etched-printable-frosted-vinyl','canvas-roll','tension-fabric','dry-erase-magnet','styrene','gatorfoam','pvc-board','aluminum-sandwich-board','in-house/name-badges','in-house/photo-id','in-house/solar-placards']);
const inHouseTags={'name-badges':'in-house/name-badges','photo-id-badges':'in-house/photo-id','solar-placards':'in-house/solar-placards'};
export const POLICY='shopify-spring-valley-origin-zero-fees-2026-11-17';
export const NATIVE_SPECS=Object.freeze({
  'gid://shopify/ProductVariant/67904924352808':{title:'Reserved parking sign',priceCents:7500,packageIn:[20,15,2],origin:'rd-troy',maxPerParcel:1},
  'gid://shopify/ProductVariant/67904924385576':{title:'Magnetic name plate',priceCents:2500,packageIn:[15,10,1],origin:'rd-troy',maxPerParcel:1}
});
export const DESTINATIONS=Object.freeze({
  troy:{address1:'8680 Troy Street',address2:'',city:'Spring Valley',provinceCode:'CA',zip:'91977',countryCode:'US'},
  seattle:{address1:'600 4th Ave',address2:'',city:'Seattle',provinceCode:'WA',zip:'98104',countryCode:'US'},
  philadelphia:{address1:'9250 Ashton Rd',address2:'',city:'Philadelphia',provinceCode:'PA',zip:'19114',countryCode:'US'},
  newyork:{address1:'625 8th Avenue',address2:'',city:'New York',provinceCode:'NY',zip:'10018',countryCode:'US'},
  dallas:{address1:'1500 Marilla St',address2:'',city:'Dallas',provinceCode:'TX',zip:'75201',countryCode:'US'},
  denver:{address1:'1437 Bannock St',address2:'',city:'Denver',provinceCode:'CO',zip:'80202',countryCode:'US'},
  chicago:{address1:'121 N LaSalle St',address2:'',city:'Chicago',provinceCode:'IL',zip:'60602',countryCode:'US'},
  americanfork:{address1:'64 S 100 E',address2:'',city:'American Fork',provinceCode:'UT',zip:'84003',countryCode:'US'},
  houston:{address1:'6111 Bourgeois Rd',address2:'',city:'Houston',provinceCode:'TX',zip:'77066',countryCode:'US'},
  northcarolina:{address1:'222 W Hargett St',address2:'',city:'Raleigh',provinceCode:'NC',zip:'27601',countryCode:'US'}
});
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
export const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const hold=(code,message)=>{throw Object.assign(new Error(message),{code,status:409,cartPreserved:true});};
export function localDate(stamp){const a=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));return `${a.year}-${a.month}-${a.day}`;}
const legacy=a=>/^Shipping Handling |^(Shipping Snapshot|Shipping Policy|Shipping Reserve|Shipping Handling|Shipping Quote|Shipping Rate Origin|Shipping Delivery)$/i.test(a.key??'');
const size=text=>{
  const m=String(text??'').trim().replace(/\s*\(w\s*x\s*h\)\s*$/i,'').match(/^(\d+(?:\.\d+)?|\.\d+)\s*(inches|inch|in|ft|feet|foot|["″'])\s*[x×]\s*(\d+(?:\.\d+)?|\.\d+)\s*(inches|inch|in|ft|feet|foot|["″'])$/i);
  const scale=u=>/^(ft|feet|foot|')$/i.test(u)?12:1;return m?[Number(m[1])*scale(m[2]),Number(m[3])*scale(m[4])]:null;
};
const normStreet=s=>String(s??'').toUpperCase().replace(/\bSTREET\b/g,'ST').replace(/\bAVENUE\b/g,'AVE').replace(/\bROAD\b/g,'RD').replace(/[.,]/g,'').replace(/\s+/g,' ').trim();
export function address(raw){
  const d={};for(const k of ['address1','city','provinceCode','zip','countryCode']){if(typeof raw?.[k]!=='string'||!raw[k].trim()||raw[k].length>200)hold('ADDRESS_REQUIRED','Enter the delivery street, city, state and ZIP code.');d[k]=raw[k].trim();}
  d.address2=String(raw.address2??'').trim().slice(0,200);d.countryCode=d.countryCode.toUpperCase();d.provinceCode=d.provinceCode.toUpperCase();
  if(d.countryCode!=='US'||!/^\d{5}(?:-\d{4})?$/.test(d.zip)||!/^[A-Z]{2}$/.test(d.provinceCode))hold('ADDRESS_OUTSIDE_SCOPE','This destination needs a shipping quote before payment.');return d;
}
function contact(raw){
  const c={};for(const k of ['name','email','company','phone']){if(typeof raw?.[k]!=='string'||raw[k].length>250)hold('CONTACT_INVALID','Check the contact details.');c[k]=raw[k].trim();}
  if(!c.name||!/^\S+@\S+\.\S+$/.test(c.email))hold('CONTACT_REQUIRED','Enter a contact name and email. Company and phone are optional.');return c;
}
export function cartContent(cart){return {id:cart.id,version:cart.version??0,status:cart.status,items:cart.items};}
export function recipientName(fullName){const words=String(fullName??'').trim().split(/\s+/).filter(Boolean);return words.length>1?{firstName:words.shift(),lastName:words.join(' ')}:{firstName:'',lastName:words[0]??''};}
export function normalizeSavedCart(cart,destination){
  if(!cart?.id||cart.status!=='open'||!Array.isArray(cart.items)||!cart.items.length||cart.items.length>80)hold('CART_INVALID','Reopen this saved cart before calculating shipping.');
  const deliveries=new Set(),lines=[],native=[],drinkware=[];let heldStock=false;
  for(const item of cart.items){
    if(!item.id||!Array.isArray(item.draftInput?.lineItems)||!item.draftInput.lineItems.length)hold('CART_INVALID','A saved product is incomplete.');
    const tags=item.draftInput.tags??[],methods=[...new Set(tags.filter(t=>['ship','pickup-spring-valley','pickup-la-mesa','pickup-pine-valley'].includes(t)))];
    if(methods.length!==1)hold('DELIVERY_REQUIRED','Each product needs one delivery choice.');
    const method=methods[0],handles=[...new Set(tags.map(t=>inHouseTags[t]??t).filter(t=>catalog.has(t)))];
    const handle=handles.length===1?handles[0]:handles.length===0&&tags.includes('custom-banner')?'13oz-vinyl-banner':null;
    if(handles.length>1)hold('PRODUCT_AMBIGUOUS','This product has conflicting saved details.');
    if((handle==='13oz-vinyl-banner'&&method==='pickup-spring-valley')||(handle!=='13oz-vinyl-banner'&&['pickup-la-mesa','pickup-pine-valley'].includes(method)))hold('PICKUP_LOCATION_INVALID','Use the listed pickup location for each product.');
    deliveries.add(method);const taggedHeld=tags.some(t=>/express-one|held-stock/.test(t));
    for(const [i,line] of item.draftInput.lineItems.entries()){
      if(!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>120||line.components?.length||line.requiresShipping===false)hold('CART_INVALID','Check the saved quantity and physical products.');
      const attrs=line.customAttributes??[];
      const isHeld=taggedHeld||attrs.some(a=>(a.key==='Express One'&&/^yes/i.test(a.value))||(a.key==='Badges Held for Later'&&Number(a.value)>0));let shippingQuantity=line.quantity;
      if(isHeld){const get=k=>attrs.find(a=>a.key===k)?.value,nowUnits=Number(get('Badges Needed Now')),laterUnits=Number(get('Badges Held for Later'));if(handle!=='in-house/name-badges'||!Number.isSafeInteger(nowUnits)||nowUnits<1||!Number.isSafeInteger(laterUnits)||laterUnits<0||nowUnits+laterUnits!==line.quantity)heldStock=true;else shippingQuantity=nowUnits;}
      const deliveryAttr=attrs.find(a=>a.key==='Delivery Method')?.value;
      if(deliveryAttr&&((method==='ship'&&deliveryAttr!=='Ship')||(method!=='ship'&&deliveryAttr==='Ship')))hold('DELIVERY_CONFLICT','The saved delivery details conflict.');
      const id=`${item.id}:${i}`;
      const drinkwareSpec=line.variantId?drinkwareVariants.get(line.variantId):tags.includes('polar-camel')?drinkwareSkus.get(attrs.find(a=>a.key==='SKU')?.value):null;
      if(drinkwareSpec){drinkware.push({id,handle:drinkwareSpec.handle,quantity:line.quantity});continue;}
      if(line.variantId){if(!NATIVE_SPECS[line.variantId])hold('NATIVE_PACKAGE_UNSUPPORTED','This product needs a supported package before automatic shipping.');native.push({id,variantId:line.variantId,quantity:line.quantity});continue;}
      if(!handle)hold('FAMILY_UNSUPPORTED','This saved product needs a shipping quote before payment.');
      const sizeAttribute=attrs.find(a=>['Product Size','Size','Banner Size','Badge Size'].includes(a.key));
      const parsedSize=size(sizeAttribute?.value);
      if(sizeAttribute&&!parsedSize)hold('PRODUCT_SIZE_UNVERIFIED','This product size needs a packing check before automatic shipping.');
      lines.push({id,handle,quantity:shippingQuantity,size:parsedSize,options:attrs.filter(a=>!legacy(a)).map(a=>[String(a.key).toLowerCase(),String(a.value).toLowerCase()]),requiresShipping:true});
    }
  }
  if(deliveries.size!==1)hold('MIXED_DELIVERY','Use separate carts for shipping and each pickup location.');
  return {id:cart.id,delivery:[...deliveries][0],destination,lines,native,drinkware,heldStock};
}
function nativeAddressSupported(d,evidence){
  const zip=d.zip.slice(0,5);
  // New observations are explicitly reviewed ZIP estimates. Retain the old
  // exact-address restriction for legacy evidence lacking that reviewed scope.
  return evidence.some(q=>q.scope==='representative-zip-estimate'&&q.destinationZip===zip&&q.destinationState===d.provinceCode)||Object.values(DESTINATIONS).some(a=>['91977','98104','19114'].includes(a.zip)&&a.zip===zip&&a.provinceCode===d.provinceCode&&normStreet(a.address1)===normStreet(d.address1)&&!d.address2);
}
export function createCheckoutShipping({rateTable,nativeEvidence,drinkwareEvidence=[],key,now=Date.now,quoteTtlMs=300000,buildDraftInput,operations=null}={}){
  if(!Array.isArray(rateTable)||!Array.isArray(nativeEvidence)||typeof key!=='string'||key.length<32||typeof now!=='function'||typeof buildDraftInput!=='function')throw Error('Private shipping configuration required.');
  if(rateTable.some(r=>r.origin!==RATE_ORIGIN.id))throw Error('All private shipping rates must originate in Spring Valley.');
  if(nativeEvidence.some(r=>r.origin!==RATE_ORIGIN.id))throw Error('Native parcel quotes must also originate in Spring Valley.');
  const evidenceHash=digest({rateTable,nativeEvidence,drinkwareEvidence,rateOrigin:RATE_ORIGIN});
  const sign=b=>createHmac('sha256',key).update(JSON.stringify(canonical(b))).digest('hex');
  function calculate(cart,destination){
    const c=normalizeSavedCart(cart,destination),date=localDate(now());
    if(c.delivery!=='ship')return {state:'pickup',shippingCents:0,markupBasisPoints:0,handlingCents:0,parcels:[],delivery:c.delivery};
    if(c.heldStock)hold('HELD_STOCK_RELEASE_REQUIRED','Select the units shipping now before estimating an Express One release.');
    const parcels=[];
    if(c.lines.length){const result=estimateCart({...c,delivery:'ship'},rateTable,{now:date});if(result.state==='pickup-only')hold('RIGID_PICKUP_ONLY','Signs over 48 × 36 inches require pickup at 8680 Troy St., Spring Valley.');if(result.state!=='estimated')hold('SHIPPING_QUOTE_REQUIRED','This cart needs a shipping quote before payment. Your cart is saved.');parcels.push(...result.parcels);}
    if(c.native.length){
      if(!nativeAddressSupported(destination,nativeEvidence))hold('NATIVE_DESTINATION_QUOTE_REQUIRED','This destination needs a current parcel quote.');
      for(const line of c.native){
        if(line.quantity>5)hold('NATIVE_BULK_QUOTE_REQUIRED','This quantity needs a bulk packing check.');
        const evidence=nativeEvidence.filter(q=>q.destinationZip===destination.zip.slice(0,5)&&(!q.destinationState||q.destinationState===destination.provinceCode)&&q.lines?.length===1&&q.lines[0].variantId===line.variantId.split('/').at(-1)&&q.lines[0].quantity===1).sort((a,b)=>b.date.localeCompare(a.date))[0];
        if(evidence&&(date<evidence.date||date>(evidence.expiresOn??new Date(Date.parse(evidence.date+'T12:00:00Z')+4*86400000).toISOString().slice(0,10))))hold('NATIVE_RATE_EXPIRED','This parcel needs a refreshed Shopify rate.');
        const ground=evidence?.result?.data?.draftOrderAvailableDeliveryOptions?.availableShippingRates?.find(r=>r.source==='ups_shipping'&&r.code==='03'&&r.price?.currencyCode==='USD');
        const cents=evidence?.groundCents??(ground?Math.round(Number(ground.price.amount)*100):null);
        if(!Number.isSafeInteger(cents)||cents<=0)hold('NATIVE_RATE_MISSING','A parcel rate is missing. This cart needs a quote before payment.');
        for(let i=0;i<line.quantity;i++)parcels.push({origin:'rd-troy',family:'native-parking',packageIn:NATIVE_SPECS[line.variantId].packageIn,unitCount:1,lineIds:[line.id],baseCents:cents,carrier:'UPS',service:'Ground',rateId:`native-${line.variantId.split('/').at(-1)}-${destination.zip.slice(0,5)}`,evidenceIds:[evidence.id||'Shopify read-only single-parcel quote'],packingBasis:'Independent single-item parcel; do not reuse inflated native mixed-profile total'+(evidence.scope==='representative-zip-estimate'?'. Recorded ZIP estimate; street-specific carrier classification may vary.':'')});
      }
    }
    if(c.drinkware.length){const result=planDrinkware(c.drinkware,destination,drinkwareEvidence,{now:date});if(result.state!=='estimated')hold('DRINKWARE_QUOTE_REQUIRED','This drinkware cart needs a current shipping quote before payment.');parcels.push(...result.parcels);}
    const shippingCents=parcels.reduce((n,p)=>n+p.baseCents,0);if(!Number.isSafeInteger(shippingCents)||shippingCents<=0)hold('SHIPPING_RATE_INCOMPLETE','A complete shipping amount is required.');
    return {state:'estimated',delivery:'ship',shippingCents,markupBasisPoints:0,handlingCents:0,rateOrigin:RATE_ORIGIN,parcels};
  }
  const reviewable=new Set(['SHIPPING_QUOTE_REQUIRED','NATIVE_DESTINATION_QUOTE_REQUIRED','NATIVE_BULK_QUOTE_REQUIRED','NATIVE_RATE_MISSING','NATIVE_RATE_EXPIRED','DRINKWARE_QUOTE_REQUIRED']);
  function resolve(cart,d,c,{record=false}={}){
    const normalized=normalizeSavedCart(cart,d),context=operations?.context(cart,d,c,[...normalized.lines,...normalized.native,...normalized.drinkware]);
    if(record&&context)operations.supersede(context);
    try{return calculate(cart,d);}catch(e){if(!operations||!reviewable.has(e.code))throw e;
      const approved=operations.approved(context);if(approved)return structuredClone(approved.approval.result);
      if(!record)hold('SHIPPING_REVIEW_PENDING','Shipping confirmation is pending. Recheck shipping after the owner reviews the complete cart.');
      const pending=operations.pending(context,e.code);throw Object.assign(new Error('Your cart is saved. Shipping needs confirmation before payment. Recheck shipping after the owner reviews it.'),{code:'SHIPPING_REVIEW_PENDING',status:409,cartPreserved:true,reviewId:pending.id});
    }
  }
  function quote(cart,rawDestination,rawContact){
    const c=contact(rawContact),d=address(rawDestination),result=resolve(cart,d,c,{record:true}),stamp=now();
    const body={id:randomUUID(),policy:POLICY,cartHash:digest(cartContent(cart)),evidenceHash,destination:d,contact:c,result,createdAt:stamp,expiresAt:stamp+quoteTtlMs};
    return {...body,signature:sign(body)};
  }
  function verifyAccepted(cart,s=cart.shippingEstimatePreview){
    if(!s)hold('SHIPPING_REQUIRED','Calculate shipping before reviewing checkout.');
    const {signature,...b}=s;
    if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(b),'hex')))hold('SHIPPING_INVALID','Recalculate shipping before checkout.');
    if(b.policy!==POLICY||b.cartHash!==digest(cartContent(cart)))hold('CART_CHANGED','The cart changed. Calculate shipping again.');
    if(!Number.isSafeInteger(b.result?.shippingCents)||b.result.shippingCents<0||b.result.markupBasisPoints!==0||b.result.handlingCents!==0)hold('SHIPPING_INVALID','Recalculate shipping before checkout.');
    return s;
  }
  function checked(cart){
    const s=verifyAccepted(cart),b=s;
    if(b.evidenceHash!==evidenceHash)hold('CART_CHANGED','Shipping rates changed. Calculate shipping again.');
    if(b.createdAt>now()||b.expiresAt<=now())hold('SHIPPING_EXPIRED','Calculate shipping again to refresh the estimate.');
    const result=resolve(cart,b.destination,b.contact);if(digest(result)!==digest(b.result))hold('SHIPPING_CHANGED','The shipping estimate changed. Review the new amount.');return s;
  }
  function shippingLine(cart){const s=checked(cart);return {title:s.result.delivery==='ship'?'Standard shipping':'Pickup',priceWithCurrency:{amount:(s.result.shippingCents/100).toFixed(2),currencyCode:'USD'}};}
  function prepare(cart,expectedQuoteId){
    const s=checked(cart);if(expectedQuoteId!==s.id)hold('SHIPPING_CHANGED','Use the current shipping estimate before reviewing checkout.');
    const input=structuredClone(buildDraftInput(cart));
    input.lineItems=input.lineItems.map(l=>({...l,customAttributes:(l.customAttributes??[]).filter(a=>!legacy(a))}));
    input.email=s.contact.email;input.phone=s.contact.phone||undefined;input.useCustomerDefaultAddress=false;
    if(s.result.delivery==='ship')input.shippingAddress={...s.destination,...recipientName(s.contact.name),company:s.contact.company,phone:s.contact.phone};
    input.shippingLine=shippingLine(cart); // Always replaces old fixed lines and opaque native mixed-profile handles.
    input.customAttributes=[...(input.customAttributes??[]).filter(a=>!legacy(a)),{key:'Shipping Policy',value:POLICY},{key:'Shipping Rate Origin',value:'8680 Troy St., Spring Valley, CA 91977'},{key:'Shipping Reserve',value:'0%'},{key:'Shipping Handling',value:'0.00'},{key:'Shipping Quote',value:s.id},{key:'Shipping Delivery',value:s.result.delivery}];
    for(const [key,value]of [['Order contact name',s.contact.name],['Order company',s.contact.company],['Order phone',s.contact.phone]]){input.customAttributes=input.customAttributes.filter(a=>a.key!==key);input.customAttributes.push({key,value});}
    return {input,snapshot:s,createsDraft:false,createsOrder:false,chargesPayment:false};
  }
  return Object.freeze({quote,checked,verifyAccepted,shippingLine,prepare,calculate,operations});
}

