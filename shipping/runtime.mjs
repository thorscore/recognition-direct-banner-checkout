import fs from 'node:fs';
import {shippingOperations} from './operations.mjs';
import {readRateSnapshot,decodeRateSnapshot} from './rate-snapshot.mjs';
import {createCheckoutShipping,digest,DESTINATIONS,POLICY,address,recipientName} from './checkout-shipping.mjs';
export function shippingRuntime({key,now=Date.now,opsPath,operations=opsPath?shippingOperations({path:opsPath,now}):null,snapshotFile=process.env.SHIPPING_RATE_SNAPSHOT_FILE,snapshotGzip=process.env.SHIPPING_RATE_SNAPSHOT_GZIP,buildDraftInput=cart=>({lineItems:cart.items.flatMap(i=>i.draftInput.lineItems)})}){
  const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
  if(snapshotFile&&snapshotGzip)throw Error('ONE_PRIVATE_SHIPPING_RATE_SOURCE_REQUIRED');
  if(process.env.NODE_ENV==='production'&&!snapshotFile&&!snapshotGzip)throw Error('PRIVATE_SHIPPING_RATE_SNAPSHOT_REQUIRED');
  const options={now:now(),allowExpired:true};
  const snapshot=snapshotFile?readRateSnapshot(snapshotFile,options):snapshotGzip?decodeRateSnapshot(snapshotGzip,options):null;
  return createCheckoutShipping({key,now,buildDraftInput,operations,rateTable:snapshot?.rateTable??read('representative-rate-table.json'),nativeEvidence:snapshot?.nativeEvidence??read('native-cart-quotes.json'),drinkwareEvidence:snapshot?.drinkwareEvidence??[]});
}
const invalid=code=>{throw Object.assign(new Error(code),{code,status:409});};
export function photoShippingPolicy(shipping){
  function cart(record){
    return {id:record.jobId,version:record.revision,status:'open',items:[{id:record.jobId,orderId:record.jobId,draftInput:{tags:['photo-id-badges',record.delivery==='troy'?'pickup-spring-valley':'ship'],lineItems:[{title:'Photo ID badges',quantity:record.quantity,requiresShipping:true,originalUnitPriceWithCurrency:{amount:(record.unitCents/100).toFixed(2),currencyCode:'USD'},customAttributes:[{key:'Shipping design binding',value:digest({document:record.document,assets:record.assetHashes,side:record.side,subtotalCents:record.subtotalCents})}]}]}}]};
  }
  function quotedCart(record,snapshot){return {...cart(record),shippingEstimatePreview:snapshot};}
  return Object.freeze({
    quote(record,destination){return shipping.quote(cart(record),record.delivery==='troy'?DESTINATIONS.troy:destination,{name:record.contact?.name??'',company:record.contact?.company??'',phone:record.contact?.phone??'',email:record.email});},
    accept(record,snapshot,quoteId){
      if(snapshot?.id!==quoteId)invalid('SHIPPING_CHANGED');
      const q=shipping.checked(quotedCart(record,snapshot));
      if(q.contact.email!==record.email||q.contact.name!==record.contact?.name||q.contact.company!==(record.contact?.company??'')||q.contact.phone!==(record.contact?.phone??''))invalid('SHIPPING_CONTACT_CHANGED');
      return structuredClone(q);
    },
    forRun(record,{fresh=false}={}){
      if(!record.shippingEstimate)invalid('SHIPPING_REQUIRED');
      const c=quotedCart(record,record.shippingEstimate),q=fresh?shipping.checked(c):shipping.verifyAccepted(c);
      if(q.contact.email!==record.email||q.contact.name!==record.contact?.name||q.contact.company!==(record.contact?.company??'')||q.contact.phone!==(record.contact?.phone??''))invalid('SHIPPING_CONTACT_CHANGED');
      const pickup=record.delivery==='troy';if(pickup!==(q.result.delivery==='pickup-spring-valley')||pickup&&q.result.shippingCents!==0)invalid('SHIPPING_DELIVERY_CHANGED');
      return {cents:q.result.shippingCents,destination:{...q.destination,...recipientName(q.contact.name),company:q.contact.company,phone:q.contact.phone},attributes:[{key:'Shipping Policy',value:POLICY},{key:'Shipping Rate Origin',value:'8680 Troy St., Spring Valley, CA 91977'},{key:'Shipping Reserve',value:'0%'},{key:'Shipping Handling',value:'0.00'},{key:'Shipping Quote',value:q.id}]};
    }
  });
}
export function designerShippingPolicy(shipping){
  function cart(o){return {id:o.key,version:1,status:'open',items:[{id:o.key,orderId:o.key,draftInput:{tags:['name-badges',o.design.delivery==='troy'?'pickup-spring-valley':'ship',...(o.heldForLater>0?['held-stock']:[])],lineItems:[{title:'Name badges',quantity:o.design.quantity,requiresShipping:true,originalUnitPriceWithCurrency:{amount:(o.price.unitCents/100).toFixed(2),currencyCode:'USD'},customAttributes:[{key:'Shipping design binding',value:digest({design:o.design,logo:o.logo,logoScale:o.logoScale,price:o.price})},...(o.heldForLater>0?[{key:'Badges Needed Now',value:String(o.namedQuantity)},{key:'Badges Held for Later',value:String(o.heldForLater)}]:[])]} ]}}]};}
  function validate(o,q,{fresh=false}={}){const c={...cart(o),shippingEstimatePreview:q},accepted=fresh?shipping.checked(c):shipping.verifyAccepted(c);if(accepted.contact.email!==o.email||accepted.contact.name!==o.contact?.name||accepted.contact.company!==(o.contact?.company??'')||accepted.contact.phone!==(o.contact?.phone??''))invalid('SHIPPING_CONTACT_CHANGED');return accepted;}
  return {
    quote(o,d){return shipping.quote(cart(o),o.design.delivery==='troy'?DESTINATIONS.troy:d,{name:o.contact?.name??'',email:o.email,company:o.contact?.company??'',phone:o.contact?.phone??''});},
    accept(o,q,id,destination){if(!q||q.id!==id)invalid('SHIPPING_REQUIRED');const accepted=validate(o,q,{fresh:true});if(o.design.delivery!=='troy'&&destination&&digest(address(destination))!==digest(accepted.destination))invalid('SHIPPING_ADDRESS_CHANGED');return structuredClone(accepted);},
    retained(o,destination){const q=validate(o,o.shippingEstimate);if(o.design.delivery!=='troy'&&destination&&digest(address(destination))!==digest(q.destination))invalid('SHIPPING_ADDRESS_CHANGED');return q;},
    fields(o){const q=validate(o,o.shippingEstimate);return {cents:q.result.shippingCents,title:'Standard shipping',destination:{...q.destination,...recipientName(q.contact.name),company:q.contact.company,phone:q.contact.phone},attributes:[{key:'Shipping Policy',value:POLICY},{key:'Shipping Quote',value:q.id},{key:'Shipping Rate Origin',value:'8680 Troy St., Spring Valley, CA 91977'},{key:'Shipping Reserve',value:'0%'},{key:'Shipping Handling',value:'0.00'}]};}
  };
}
