import assert from 'node:assert/strict';
import test from 'node:test';
import {ExpressOneStore,seedPreview} from '../express-one-store.mjs';
import {ExpressOneShopify,shippingOrderInput,shopifyReadinessQuery,shopifyCreateMutation,shopifyOrderQuery,shopifyFindQuery} from '../express-one-shopify.mjs';
import {deliveryLabel,deliveryOptions} from '../express-one-delivery.mjs';

const staff={role:'staff',subject:'sample-staff'};
const address={recipient:'Sample Contact',company:'Sample Property',address1:'123 Sample Street',address2:'Office 1',city:'Spring Valley',provinceCode:'CA',zip:'91977',countryCode:'US',email:'sample@example.test',phone:'+16195550123',confirmAddress:true};
function fixture(t,options={}) {
  const store=new ExpressOneStore();seedPreview(store);t.after(()=>store.close());
  const account=store.accountForIdentity({issuer:'preview',subject:'preview-customer'}),customer={role:'customer',subject:'sample',accountId:account.id};
  const stock=store.snapshot(customer).stock[0];
  const {id}=store.createRequest(customer,{stockId:stock.id,names:[{name:'PRIVATE BADGE NAME'},{name:'Second'}],delivery:options.delivery||'ship',notes:'PRIVATE DELIVERY NOTE',requestKey:'sample'});
  if(options.approve!==false)store.changeRequest(staff,{id,action:'approve'});
  let mutations=0,status='UNFULFILLED',cancelledAt=null,throwCreate=false,userError=false,findCount=1;
  const order=()=>({id:'gid://shopify/Order/123',name:'#SAMPLE',tags:[`eo-${id}`],customAttributes:[{key:'Express One request',value:id}],totalPriceSet:{shopMoney:{amount:'0.00',currencyCode:'USD'}},cancelledAt,displayFulfillmentStatus:status,lineItems:{nodes:[{sku:'EXPRESS-ONE-PREPAID-RELEASE',quantity:2,requiresShipping:true,originalUnitPriceSet:{shopMoney:{amount:'0.00',currencyCode:'USD'}}}],pageInfo:{hasNextPage:false}},fulfillments:status==='FULFILLED'?[{status:'SUCCESS',trackingInfo:[{company:'UPS',number:'SAMPLE-TRACKING'}]}]:[]});
  const graphql=async(query,variables)=>{
    if(query===shopifyReadinessQuery)return{shop:{currencyCode:options.currency||'USD'},currentAppInstallation:{accessScopes:(options.scopes||['write_orders']).map(handle=>({handle}))}};
    if(query===shopifyCreateMutation){mutations++;assert.equal(variables.order.lineItems[0].priceSet.shopMoney.amount,'0.00');if(throwCreate)throw Error('PRIVATE RAW ERROR');return{orderCreate:userError?{order:null,userErrors:[{message:'PRIVATE'}]}:{order:{id:'gid://shopify/Order/123',name:'#SAMPLE'},userErrors:[]}};}
    if(query===shopifyOrderQuery)return{order:order()};
    if(query===shopifyFindQuery)return{orders:{nodes:Array.from({length:findCount},order),pageInfo:{hasNextPage:false}}};
    throw Error('Unexpected operation');
  };
  const bridge=new ExpressOneShopify(store,{graphql,shop:'sample',enabled:true,...options.bridge});
  return {store,customer,stock,id,bridge,order,graphql,mutations:()=>mutations,setStatus:value=>status=value,cancel:()=>cancelledAt=new Date().toISOString(),setThrow:()=>throwCreate=true,setUserError:value=>userError=value,setFindCount:value=>findCount=value};
}

test('new delivery choices exclude old pickups while historical requests keep their original location and fulfillment rules',t=>{
  const f=fixture(t,{delivery:'pickup-spring-valley'});
  assert.deepEqual(deliveryOptions,['ship','pickup-spring-valley']);assert.match(deliveryLabel('pickup-spring-valley'),/8680 Troy St\. Spring Valley, CA 91977/);
  for(const legacy of ['pickup-la-mesa','pickup-pine-valley']){
    assert.throws(()=>f.store.createRequest(f.customer,{stockId:f.stock.id,names:[{name:'Sample'}],delivery:legacy,requestKey:legacy}),/Spring Valley/);
  }
  f.store.db.prepare('UPDATE requests SET delivery=? WHERE id=?').run('pickup-pine-valley',f.id);
  assert.match(deliveryLabel(f.store.requestRecord(staff,f.id).delivery),/Pine Valley.*original/);
  assert.throws(()=>f.store.changeRequest(staff,{id:f.id,action:'fulfill',shippingCents:100}),/Pickup/);
  f.store.changeRequest(staff,{id:f.id,action:'fulfill',shippingCents:0});assert.equal(f.store.requestRecord(staff,f.id).status,'ready');
});

test('shipping-order payload creates only a zero-dollar physical prepaid release with no payment, inventory decrement, customer receipt or badge names',t=>{
  const f=fixture(t),payload=shippingOrderInput(f.store.requestRecord(staff,f.id),address);
  assert.equal(payload.order.lineItems[0].quantity,2);assert.equal(payload.order.lineItems[0].requiresShipping,true);assert.equal(payload.order.lineItems[0].priceSet.shopMoney.amount,'0.00');
  assert.deepEqual(payload.options,{inventoryBehaviour:'BYPASS',sendReceipt:false,sendFulfillmentReceipt:false});
  assert.equal(payload.order.transactions,undefined);assert.equal(payload.order.financialStatus,undefined);assert.equal(payload.order.fulfillmentStatus,undefined);assert.equal(payload.order.customer,undefined);
  assert.doesNotMatch(JSON.stringify(payload),/PRIVATE BADGE NAME|PRIVATE DELIVERY NOTE/);assert.equal(payload.order.shippingAddress.lastName,'Sample Contact');
});

test('only approved shipped requests with verified structured addresses can create orders',async t=>{
  for(const options of [{approve:false},{delivery:'pickup-spring-valley'}]){const f=fixture(t,options);await assert.rejects(f.bridge.create(staff,{...address,id:f.id}),/approved/);assert.equal(f.mutations(),0);}
  const f=fixture(t);
  for(const change of [{confirmAddress:false},{city:''},{countryCode:'USA'},{phone:'619-555-0123'},{email:'bad\r\nBcc:x@test.com'}])await assert.rejects(f.bridge.create(staff,{...address,...change,id:f.id}));
  await assert.rejects(f.bridge.create(f.customer,{...address,id:f.id,role:'staff'}),/Staff/);assert.equal(f.mutations(),0);
});

test('missing Shopify order access, wrong currency, disabled integrations and previews fail closed',async t=>{
  for(const options of [{scopes:['write_draft_orders']},{currency:'CAD'},{bridge:{enabled:false}},{bridge:{preview:true}}]){const f=fixture(t,options);await assert.rejects(f.bridge.create(staff,{...address,id:f.id}));assert.equal(f.mutations(),0);}
});

test('request tags stay within Shopify order limits and preserve the complete UUID for recovery',async t=>{
  const f=fixture(t),payload=shippingOrderInput(f.store.requestRecord(staff,f.id),address);
  assert.ok(payload.order.tags.every(tag=>tag.length<=55));
  assert.ok(payload.order.tags.includes(`eo-${f.id}`));assert.equal(`eo-${f.id}`.length,39);
  f.setThrow();await assert.rejects(f.bridge.create(staff,{...address,id:f.id}),/uncertain/);
  f.bridge.graphql=async(query,variables)=>{
    if(query===shopifyFindQuery)assert.equal(variables.query,`tag:eo-${f.id}`);
    return f.graphql(query,variables);
  };
  assert.equal((await f.bridge.refresh(staff,f.id)).order_name,'#SAMPLE');
});

test('duplicate and simultaneous create attempts result in one linked Shopify order without stock changes',async t=>{
  const f=fixture(t);
  const results=await Promise.allSettled([f.bridge.create(staff,{...address,id:f.id}),f.bridge.create(staff,{...address,id:f.id})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(f.mutations(),1);
  assert.equal((await f.bridge.create(staff,{...address,id:f.id})).duplicate,true);assert.equal(f.mutations(),1);
  assert.equal(f.store.requestRecord(staff,f.id).remaining,40);assert.equal(f.store.requestRecord(staff,f.id).status,'approved');assert.equal(f.store.snapshot(staff).shipping.length,0);
  assert.match(f.bridge.url('gid://shopify/Order/123'),/admin.shopify.com\/store\/sample\/orders\/123$/);assert.equal(f.bridge.url('javascript:bad'),null);
});

test('uncertain remote results never auto-retry and can recover exactly one matching order',async t=>{
  const f=fixture(t);f.setThrow();await assert.rejects(f.bridge.create(staff,{...address,id:f.id}),/uncertain/);
  assert.equal(f.store.shopifyRelease(staff,f.id).state,'uncertain');await assert.rejects(f.bridge.create(staff,{...address,id:f.id}),/Check/);assert.equal(f.mutations(),1);
  assert.throws(()=>f.store.changeRequest(staff,{id:f.id,action:'reject',reason:'Test'}),/Shopify/);
  f.setFindCount(0);await assert.rejects(f.bridge.refresh(staff,f.id),/No single/);f.setFindCount(2);await assert.rejects(f.bridge.refresh(staff,f.id),/No single/);
  f.setFindCount(1);assert.equal((await f.bridge.refresh(staff,f.id)).order_name,'#SAMPLE');assert.equal(f.mutations(),1);
});

test('explicit Shopify input rejection can be corrected and retried, while interrupted attempts remain uncertain',async t=>{
  const f=fixture(t);f.setUserError(true);await assert.rejects(f.bridge.create(staff,{...address,id:f.id}),/rejected/);assert.equal(f.store.shopifyRelease(staff,f.id).state,'failed');
  f.setUserError(false);await f.bridge.create(staff,{...address,id:f.id});assert.equal(f.mutations(),2);
  const g=fixture(t);g.store.claimShopifyRelease(staff,g.id);new ExpressOneShopify(g.store,{enabled:false});assert.equal(g.store.shopifyRelease(staff,g.id).state,'uncertain');
});

test('Shopify completion requires a full uncancelled shipment, dispatch confirmation and actual shipping cost; it deducts and accrues once',async t=>{
  const f=fixture(t);await f.bridge.create(staff,{...address,id:f.id});
  assert.throws(()=>f.store.changeRequest(staff,{id:f.id,action:'fulfill',shippingCents:100}),/Verify/);
  await assert.rejects(f.bridge.fulfill(staff,{id:f.id,shippingCents:1295,dispatchConfirmed:false}),/Confirm/);
  await assert.rejects(f.bridge.fulfill(staff,{id:f.id,shippingCents:1295,dispatchConfirmed:true}),/complete/);
  f.setStatus('PARTIALLY_FULFILLED');await assert.rejects(f.bridge.fulfill(staff,{id:f.id,shippingCents:1295,dispatchConfirmed:true}),/complete/);
  f.setStatus('FULFILLED');await f.bridge.refresh(staff,f.id);assert.equal(f.store.requestRecord(staff,f.id).remaining,40);
  await f.bridge.fulfill(staff,{id:f.id,shippingCents:1295,dispatchConfirmed:true});
  const record=f.store.requestRecord(staff,f.id);assert.equal(record.remaining,38);assert.equal(record.shipping.cents,1295);assert.equal(record.shipping.tracking,'SAMPLE-TRACKING');
  await assert.rejects(f.bridge.fulfill(staff,{id:f.id,shippingCents:1295,dispatchConfirmed:true}),/already changed/);assert.equal(f.store.snapshot(staff).shipping.length,1);assert.equal(f.store.snapshot(staff).invoiceReady.length,0);
});

test('linked orders must be cancelled in Shopify and checked before local rejection releases reservations',async t=>{
  const f=fixture(t);await f.bridge.create(staff,{...address,id:f.id});
  assert.throws(()=>f.store.changeRequest(staff,{id:f.id,action:'reject',reason:'Test complete'}),/Cancel/);
  f.cancel();await f.bridge.refresh(staff,f.id);f.store.changeRequest(staff,{id:f.id,action:'reject',reason:'Test complete'});
  assert.equal(f.store.snapshot(f.customer).stock[0].available,40);assert.equal(f.store.snapshot(f.customer).requests[0].shopify,undefined);
});

test('changed order amounts, quantities, identifiers or missing tracking cannot consume prepaid stock',async t=>{
  const f=fixture(t);await f.bridge.create(staff,{...address,id:f.id});f.setStatus('FULFILLED');
  for(const alter of [
    order=>{order.totalPriceSet.shopMoney.amount='1.00';},
    order=>{order.lineItems.nodes[0].quantity=3;},
    order=>{order.tags=[];},
    order=>{order.customAttributes=[];},
    order=>{order.lineItems.nodes[0].requiresShipping=false;},
    order=>{order.fulfillments=[];}
  ]){
    const bridge=new ExpressOneShopify(f.store,{shop:'sample',enabled:true,graphql:async(query,variables)=>{
      if(query===shopifyOrderQuery){const order=f.order();alter(order);return {order};}return f.graphql(query,variables);
    }});
    await assert.rejects(bridge.fulfill(staff,{id:f.id,shippingCents:1000,dispatchConfirmed:true}));
    assert.equal(f.store.requestRecord(staff,f.id).remaining,40);assert.equal(f.store.requestRecord(staff,f.id).status,'approved');
  }
  f.cancel();await assert.rejects(f.bridge.fulfill(staff,{id:f.id,shippingCents:1000,dispatchConfirmed:true}),/uncancelled/);
  assert.equal(f.store.snapshot(staff).shipping.length,0);
});

test('empty remote mutation responses become uncertain rather than allowing another order',async t=>{
  const f=fixture(t),bridge=new ExpressOneShopify(f.store,{shop:'sample',enabled:true,graphql:async(query,variables)=>query===shopifyCreateMutation ? null:f.graphql(query,variables)});
  await assert.rejects(bridge.create(staff,{...address,id:f.id}),/Check Shopify/);
  assert.equal(f.store.shopifyRelease(staff,f.id).state,'uncertain');
  await assert.rejects(bridge.create(staff,{...address,id:f.id}),/Check/);
});
