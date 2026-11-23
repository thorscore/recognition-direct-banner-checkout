import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cartCheckout} from './cart-checkout.mjs';
import {localDate} from './checkout-shipping.mjs';

// Entirely synthetic fixtures. These amounts are test data, not shipping evidence.
test('shipping form keeps unsupported products and delivery errors in the saved cart',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'rd-shipping-form-test-'));
  const stamp=Date.now(),date=localDate(stamp),snapshotFile=join(dir,'synthetic-rates.json');
  await fs.writeFile(snapshotFile,JSON.stringify({schema:'rd-shopify-shipping-snapshot.v1',id:'synthetic-test-only',nativeEvidence:[],observations:[{id:'synthetic-observation',originZip:'91977',observedOn:date,packageIn:[32,22,4],packedWeightLb:8,sourceReference:'synthetic-test-fixture',destinationZip:'10018',rates:[{carrier:'UPS',service:'Ground',cents:1200}]}],rateTable:[{id:'synthetic-rate',origin:'rd-troy',originAddress:{zip:'91977'},rateSource:'Shopify Shipping',currency:'USD',validation:'passed',baseCents:1200,evidenceIds:['synthetic-observation'],observedOn:date,expiresOn:date,packageIn:[32,22,4],maxWeightLb:8,region:'east',packageKey:'panel-small'}]}));
  const previous={file:process.env.SHIPPING_RATE_SNAPSHOT_FILE,gzip:process.env.SHIPPING_RATE_SNAPSHOT_GZIP};
  process.env.SHIPPING_RATE_SNAPSHOT_FILE=snapshotFile;delete process.env.SHIPPING_RATE_SNAPSHOT_GZIP;
  const carts=new Map();let transportCalls=0,service;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    try{
      if(req.method==='GET'){const c=carts.get(url.searchParams.get('cart'));res.writeHead(200,{'Content-Type':'text/html'});res.end(service.panel(c)+service.fields(c));return;}
      await service.estimate(req,res,url);
    }catch(e){res.writeHead(e.status??500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message,code:e.code}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{service=cartCheckout({base,key:'synthetic-form-test-key-0000000000000000000000',read:async id=>structuredClone(carts.get(id)),write:async c=>carts.set(c.id,structuredClone(c)),buildDraftInput:c=>({lineItems:c.items.flatMap(i=>i.draftInput.lineItems)}),transport:async()=>{transportCalls++;throw Error('No Shopify transport is allowed in this test');},opsPath:join(dir,'synthetic-operations.sqlite'),now:()=>stamp});}
  finally{for(const [key,value]of [['SHIPPING_RATE_SNAPSHOT_FILE',previous.file],['SHIPPING_RATE_SNAPSHOT_GZIP',previous.gzip]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  t.after(async()=>{service.shipping.operations.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
  const contact={name:'Fictional Sample',email:'sample@example.com',company:'',phone:''};
  const destination={address1:'625 8th Avenue',address2:'',city:'New York',provinceCode:'NY',zip:'10018',countryCode:'US'};
  let counter=0;
  function fixture(handle='yard-sign-and-h-stake',quantity=50,size='18 in x 24 in',delivery='ship'){
    const id='synthetic-cart-'+(++counter),c={id,version:1,status:'open',items:[{id:'synthetic-item',draftInput:{tags:[handle,delivery],lineItems:[{title:'Fictional product fixture',quantity,requiresShipping:true,customAttributes:[{key:'Product Size',value:size}]}]}}]};carts.set(id,c);return c;
  }
  async function page(id){const r=await fetch(base+'/custom-order-cart?cart='+id);const html=await r.text();return {html,csrf:html.match(/name="shipping_csrf" value="([a-f0-9]+)"/)[1]};}
  async function calculate(c,extra={},origin=base){const p=await page(c.id);return fetch(base+'/api/custom-order-cart/shipping-estimate?cart='+c.id,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...contact,...destination,shipping_csrf:p.csrf,...extra})});}

  await t.test('bulk yard-sign kits enter one whole-cart review without losing quantity',async()=>{
    const c=fixture();for(let i=0;i<2;i++){const r=await calculate(c);assert.equal(r.status,303);assert.equal(r.headers.get('location'),base+'/custom-order-cart?cart='+c.id);}
    const saved=carts.get(c.id),p=await page(c.id);assert.equal(saved.items[0].draftInput.lineItems[0].quantity,50);assert.ok(saved.shippingReview.id);assert.equal(saved.shippingEstimatePreview,undefined);assert.match(p.html,/shipping request is saved for review/i);assert.match(p.html,/tel:\+16194650055/);assert.doesNotMatch(p.html,/FAMILY_UNSUPPORTED/);
    const reviews=service.shipping.operations.list().filter(r=>r.target===c.id);assert.equal(reviews.length,1);assert.equal(reviews[0].context.lines[0].quantity,50);
    await assert.rejects(service.coordinator.checkout(c.id,'forged-quote'),e=>e.code==='SHIPPING_REQUIRED');
  });
  await t.test('mixed carts never expose a partial rate for the supported line',async()=>{
    const c=fixture();c.items.push({id:'synthetic-second',draftInput:{tags:['coroplast','ship'],lineItems:[{title:'Fictional sign',quantity:1,requiresShipping:true,customAttributes:[{key:'Product Size',value:'18 in x 12 in'}]}]}});carts.set(c.id,c);assert.equal((await calculate(c)).status,303);const saved=carts.get(c.id);assert.ok(saved.shippingReview.id);assert.equal(saved.shippingEstimatePreview,undefined);assert.equal(service.shipping.operations.read(saved.shippingReview.id).context.lines.length,2);
  });
  await t.test('other unmapped products return to an actionable cart instead of JSON',async()=>{
    const c=fixture('synthetic-unmapped-product');assert.equal((await calculate(c)).status,303);const saved=carts.get(c.id);assert.equal(saved.shippingReview.code,'FAMILY_UNSUPPORTED');assert.equal(saved.shippingReview.id,undefined);const p=await page(c.id);assert.match(p.html,/role="alert"/);assert.match(p.html,/contact us for help/);assert.equal(saved.items[0].draftInput.lineItems[0].quantity,50);
  });
  await t.test('invalid address clears an existing quote and preserves entered details',async()=>{
    const c=fixture('coroplast',1,'18 in x 12 in');assert.equal((await calculate(c)).status,303);assert.equal(carts.get(c.id).shippingEstimatePreview.result.shippingCents,1200);assert.equal((await calculate(c,{zip:'bad'})).status,303);const saved=carts.get(c.id);assert.equal(saved.shippingEstimatePreview,undefined);assert.equal(saved.shippingAddressEntry.zip,'bad');assert.equal(saved.shippingReview.code,'ADDRESS_OUTSIDE_SCOPE');
  });
  await t.test('oversized yard-sign kits stay pickup-only and outside approval bypass',async()=>{
    const c=fixture('yard-sign-and-h-stake',1,'60 in x 40 in');assert.equal((await calculate(c)).status,303);const saved=carts.get(c.id);assert.equal(saved.shippingReview.code,'RIGID_PICKUP_ONLY');assert.equal(saved.shippingReview.id,undefined);assert.equal(saved.shippingEstimatePreview,undefined);assert.equal(service.shipping.operations.list().filter(r=>r.target===c.id).length,0);
  });
  await t.test('48 by 36 yard signs still require confirmation',async()=>{
    const c=fixture('yard-sign-and-h-stake',1,'48 in x 36 in');assert.equal((await calculate(c)).status,303);assert.ok(carts.get(c.id).shippingReview.id);assert.equal(carts.get(c.id).shippingEstimatePreview,undefined);
  });
  await t.test('Troy Street pickup remains free for yard-sign kits',async()=>{
    const c=fixture('yard-sign-and-h-stake',50,'18 in x 24 in','pickup-spring-valley');assert.equal((await calculate(c)).status,303);assert.equal(carts.get(c.id).shippingEstimatePreview.result.shippingCents,0);assert.equal(carts.get(c.id).shippingEstimatePreview.result.handlingCents,0);assert.equal(carts.get(c.id).shippingEstimatePreview.result.markupBasisPoints,0);
  });
  await t.test('cross-origin shipping submissions remain blocked',async()=>{const c=fixture();assert.equal((await calculate(c,{},'https://other.example')).status,403);assert.equal(carts.get(c.id).shippingReview,undefined);});
  assert.equal(transportCalls,0);for(const c of carts.values()){assert.equal(c.shopifyDraftOrderId,undefined);assert.equal(c.checkoutAttempt?.state==='ready',false);}
});
