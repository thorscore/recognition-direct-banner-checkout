import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { ExpressOneStore, seedPreview, badgeNames } from '../express-one-store.mjs';

function fixture(t) {
  const store = new ExpressOneStore(); t.after(() => store.close()); seedPreview(store);
  const account = subject => store.accountForIdentity({issuer:'preview',subject}).id;
  const customer = {role:'customer',issuer:'preview',subject:'preview-customer',accountId:account('preview-customer')};
  const other = {role:'customer',issuer:'preview',subject:'preview-other',accountId:account('preview-other')};
  const staff = {role:'staff',subject:'preview-staff'};
  const stock = store.snapshot(customer).stock[0];
  const request = (count = 2, extras = {}) => ({stockId:stock.id,names:Array.from({length:count},(_,i) => ({name:`Person ${i+1}`,title:''})),delivery:'ship',notes:'Test address',requestKey:randomUUID(),...extras});
  return {store,customer,other,staff,stock,request};
}

test('new requests reserve stock without deducting on-hand quantity or adding shipping',t => {
  const {store,customer,stock,request,staff} = fixture(t);
  const result = store.createRequest(customer,request());
  const state = store.snapshot(customer);
  assert.equal(state.stock[0].remaining,40); assert.equal(state.stock[0].reserved,2); assert.equal(state.stock[0].available,38);
  assert.equal(state.requests[0].status,'requested'); assert.equal(state.shipping.length,0);
  assert.throws(() => store.changeRequest(staff,{id:result.id,action:'fulfill',shippingCents:100}),/already changed/);
  assert.equal(store.stockRow(stock.id,customer.accountId).remaining,40);
});
test('a customer cannot read or mutate another customer stock or requests',t => {
  const {store,customer,other,staff,request} = fixture(t);
  const {id} = store.createRequest(customer,request());
  assert.throws(() => store.createRequest(other,request()),/not found/);
  assert.throws(() => store.changeRequest(other,{id,action:'cancel'}),/not found/);
  assert.throws(() => store.changeRequest(customer,{id,action:'approve'}),/not allowed/);
  assert.equal(store.snapshot(other).requests.length,0);
  assert.doesNotMatch(JSON.stringify(store.snapshot(other)),/Sample Medical|Person 1|Test address/);
  assert.equal(store.snapshot(staff).stock.length,2);
});
test('retries are idempotent and cannot reuse a key for different request details',t => {
  const {store,customer,request} = fixture(t); const input = request();
  const one = store.createRequest(customer,input), two = store.createRequest(customer,input);
  assert.equal(one.id,two.id); assert.equal(two.duplicate,true);
  assert.equal(store.snapshot(customer).stock[0].reserved,2);
  assert.throws(() => store.createRequest(customer,{...input,notes:'Changed'}),/different details/);
});
test('pending and approved reservations cannot oversell stock',t => {
  const {store,customer,request,staff} = fixture(t);
  const {id} = store.createRequest(customer,request(39)); store.changeRequest(staff,{id,action:'approve'});
  assert.throws(() => store.createRequest(customer,request(2)),/Not enough/);
  store.createRequest(customer,request(1)); assert.equal(store.snapshot(customer).stock[0].available,0);
});
test('cancel and reject release reservations, with rejection reasons retained',t => {
  const {store,customer,request,staff} = fixture(t);
  const a = store.createRequest(customer,request()); store.changeRequest(customer,{id:a.id,action:'cancel'});
  const b = store.createRequest(customer,request()); store.changeRequest(staff,{id:b.id,action:'approve'});
  assert.throws(() => store.changeRequest(staff,{id:b.id,action:'reject',reason:''}),/required/);
  store.changeRequest(staff,{id:b.id,action:'reject',reason:'Please confirm layout'});
  const state = store.snapshot(customer); assert.equal(state.stock[0].available,40); assert.ok(state.requests.some(row => row.reason === 'Please confirm layout'));
});
test('staff records actual shipping once; invoices become recordable only after stock is depleted',t => {
  const {store,customer,request,staff} = fixture(t);
  const a = store.createRequest(customer,request(39)); store.changeRequest(staff,{id:a.id,action:'approve'});
  store.changeRequest(staff,{id:a.id,action:'fulfill',shippingCents:1295,tracking:'TEST-TRACKING'});
  assert.throws(() => store.changeRequest(staff,{id:a.id,action:'fulfill',shippingCents:1295}),/already changed/);
  assert.throws(() => store.recordInvoice(staff,{accountId:customer.accountId,reference:'TEST-INV-1'}),/no uninvoiced/);
  const b = store.createRequest(customer,request(1)); store.changeRequest(staff,{id:b.id,action:'approve'});
  store.changeRequest(staff,{id:b.id,action:'fulfill',shippingCents:450});
  const state = store.snapshot(customer); assert.equal(state.stock[0].remaining,0); assert.equal(state.shipping.length,2); assert.equal(state.totals.uninvoicedShippingCents,1745);
  assert.equal(state.invoiceReady[0].cents,1745);
  const invoice = store.recordInvoice(staff,{accountId:customer.accountId,reference:'TEST-INV-1'}); assert.equal(invoice.amountCents,1745);
  assert.equal(store.snapshot(customer).totals.uninvoicedShippingCents,0);
  assert.throws(() => store.recordInvoice(staff,{accountId:customer.accountId,reference:'TEST-INV-1'}),/no uninvoiced/);
});
test('pickup is ready, not collected, and cannot accrue shipping',t => {
  const {store,customer,request,staff} = fixture(t);
  const {id} = store.createRequest(customer,request(2,{delivery:'pickup-la-mesa'})); store.changeRequest(staff,{id,action:'approve'});
  assert.throws(() => store.changeRequest(staff,{id,action:'fulfill',shippingCents:100}),/cannot have shipping/);
  assert.equal(store.snapshot(customer).stock[0].remaining,40);
  assert.equal(store.changeRequest(staff,{id,action:'fulfill',shippingCents:0}).status,'ready');
  assert.equal(store.snapshot(customer).stock[0].remaining,38);
});
test('only staff may add verified prepaid stock and duplicate source entries are blocked',t => {
  const {store,customer,staff} = fixture(t);
  const input = {accountId:customer.accountId,title:'New style',quantity:10,paidOrder:'PAID-2',paymentVerified:true};
  assert.throws(() => store.addStock(customer,input),/Staff/);
  assert.throws(() => store.addStock(staff,{...input,paymentVerified:false}),/Verify/);
  assert.throws(() => store.addStock(staff,{...input,quantity:1.5}),/whole/);
  store.addStock(staff,input); assert.throws(() => store.addStock(staff,input),/already been added/);
});
test('TXT/CSV input supports BOM, quoted commas, and optional titles without public uploads',() => {
  assert.deepEqual(badgeNames({namesFile:'\uFEFFName,Title\n"Morgan, Alex",Manager',fileType:'csv'}),[{name:'Morgan, Alex',title:'Manager'}]);
  assert.equal(badgeNames({namesFile:'Alex\r\nTaylor\n',fileType:'txt'}).length,2);
  for (const input of [{names:[]},{names:[{name:''}]},{namesFile:'Employee,Title\nAlex,Staff',fileType:'csv'},{namesFile:'Name,Title\n"bad',fileType:'csv'},{namesFile:'Alex',fileType:'xls'},{names:[{name:'Alex'}],namesFile:'Alex',fileType:'txt'}]) assert.throws(() => badgeNames(input));
});
test('invalid delivery, excessive names, empty names and another account cannot create requests',t => {
  const {store,customer,other,request} = fixture(t);
  for (const input of [request(501),request(0),request(2,{delivery:'unauthorized'}),request(2,{names:[{name:'\u0000'}]})]) assert.throws(() => store.createRequest(customer,input));
  assert.throws(() => store.snapshot({...other,accountId:undefined}),/valid text/);
  assert.equal(store.snapshot(customer).requests.length,0);
});
test('stock, requests and shipping survive database close and reopen',async () => {
  const path = join(tmpdir(),`rd-express-one-${randomUUID()}.sqlite`);
  let store;
  try { store = new ExpressOneStore(path); seedPreview(store); const accounts = store.snapshot({role:'staff'}).accounts; store.close(); store = new ExpressOneStore(path); assert.deepEqual(store.snapshot({role:'staff'}).accounts,accounts); }
  finally { store?.close(); await rm(path,{force:true}); }
});
test('verified identity references bind exact issuer/subject and do not automatically grant stock access',t => {
  const {store,staff} = fixture(t);
  const identity = {issuer:'https://shopify.test/oidc',subject:'new-customer'};
  const reference = store.rememberIdentity(identity);
  assert.equal(store.rememberIdentity(identity),reference);
  assert.equal(store.accountForIdentity(identity),undefined);
  const account = store.createAccount(staff,{...identity,company:'Verified Company'});
  assert.equal(store.accountForIdentity(identity).id,account.id);
  assert.equal(store.accountForIdentity({...identity,issuer:'https://other.test'}),undefined);
  assert.deepEqual(store.snapshot({role:'customer',...identity,accountId:account.id}).stock,[]);
});

const propertyProfile = {kind:'property-domed',title:'Sample domed badges',description:'Gold or silver frame, full-color logo, black text, domed surface and magnetic backing.',supportEmail:'info@recognition-direct.com',supportPhone:'(619) 465-0055',sourceName:'Approved sample order form.doc'};
const propertyInfo = {propertyName:'Sample Apartments',attention:'Test Contact',address:'100 Example Street',leasingOffice:'Office 2',city:'San Diego',state:'CA',zip:'92101',email:'test@example.com',phone:'619-555-0100'};

test('property profiles retain finish and complete delivery details on the correct account',t => {
  const {store,staff,customer,other,request} = fixture(t);
  store.setOrderProfile(staff,customer.accountId,propertyProfile);
  const input = request(2,{names:[{name:'Alex',finish:'Gold'},{name:'Sam',finish:'silver'}],details:propertyInfo});
  store.createRequest(customer,input);
  const state = store.snapshot(customer);
  assert.equal(state.accounts[0].orderProfile.firstNameOnly,true);
  assert.deepEqual(state.requests[0].names.map(name => name.finish),['Gold','Silver']);
  assert.deepEqual(state.requests[0].details,propertyInfo);
  assert.equal(state.stock[0].remaining,40);
  assert.equal(store.snapshot(other).accounts[0].orderProfile,null);
  assert.doesNotMatch(JSON.stringify(store.snapshot(other)),/Sample Apartments|Office 2|Sample domed/);
  assert.deepEqual(store.snapshot(staff).requests[0].details,propertyInfo);
});

test('property orders enforce finish, first-name-only format and every property field server-side',t => {
  const {store,staff,customer,request} = fixture(t);
  store.setOrderProfile(staff,customer.accountId,propertyProfile);
  const input = request(1,{names:[{name:'Alex',finish:'Gold'}],details:propertyInfo});
  assert.throws(() => store.createRequest(customer,{...input,details:{...propertyInfo,email:'invalid'}}),/valid property email/);
  for (const field of Object.keys(propertyInfo)) assert.throws(() => store.createRequest(customer,{...input,details:{...propertyInfo,[field]:''}}),/Complete/);
  for (const names of [[{name:'Alex'}],[{name:'Alex',finish:'Blue'}],[{name:'Alex',finish:'Gold',title:'Manager'}]]) assert.throws(() => store.createRequest(customer,{...input,names}));
  assert.equal(store.snapshot(customer).requests.length,0);
});

test('only staff may set profiles; profile field definitions and finishes cannot be overridden',t => {
  const {store,staff,customer} = fixture(t);
  assert.throws(() => store.setOrderProfile(customer,customer.accountId,propertyProfile),/Staff/);
  assert.throws(() => store.setOrderProfile(staff,'missing',propertyProfile),/not found/);
  assert.throws(() => store.setOrderProfile(staff,customer.accountId,{...propertyProfile,supportEmail:'javascript:alert(1)'}),/valid support email/);
  store.setOrderProfile(staff,customer.accountId,{...propertyProfile,finishes:['Blue'],fields:[],firstNameOnly:false});
  const profile = store.profileForAccount(customer.accountId);
  assert.deepEqual(profile.finishes,['Gold','Silver']);
  assert.equal(profile.fields.length,9);
  assert.equal(profile.firstNameOnly,true);
});

test('property CSV requires finish for every badge and never silently loses titles or quantities',t => {
  const {store,staff,customer,request} = fixture(t);
  store.setOrderProfile(staff,customer.accountId,propertyProfile);
  const input = request(1,{names:undefined,namesFile:'Name,Finish\nAlex,Gold\nTaylor,Silver',fileType:'csv',details:propertyInfo});
  store.createRequest(customer,input);
  assert.equal(store.snapshot(customer).stock[0].reserved,2);
  assert.throws(() => store.createRequest(customer,{...input,namesFile:'Name\nAlex'}),/Name and Finish/);
  assert.throws(() => store.createRequest(customer,{...input,namesFile:'Name,Finish,Quantity\nAlex,Gold,4'}),/one CSV row per badge/);
  assert.throws(() => store.createRequest(customer,{...input,namesFile:'Alex',fileType:'txt'}),/gold\/silver/);
  assert.throws(() => store.createRequest(customer,{...input,details:{...propertyInfo,address:'Changed'}}),/different details/);
});

test('profile images are private to the owning customer and staff',t => {
  const {store,staff,customer,other} = fixture(t);
  store.setOrderProfile(staff,customer.accountId,propertyProfile);
  const png=Buffer.from('89504e470d0a1a0a0000','hex');
  store.setProfileImage(staff,customer.accountId,'gold',png);
  assert.deepEqual(store.profileImage(customer,customer.accountId,'gold'),png);
  assert.deepEqual(store.profileImage(staff,customer.accountId,'gold'),png);
  assert.throws(() => store.profileImage(other,customer.accountId,'gold'),/not found/);
  assert.throws(() => store.profileImage(null,customer.accountId,'gold'),/not found/);
  assert.throws(() => store.setProfileImage(customer,customer.accountId,'gold',png),/Staff/);
  assert.throws(() => store.setProfileImage(staff,customer.accountId,'gold',Buffer.from('<script>')),/supported PNG/);
  assert.match(store.snapshot(customer).accounts[0].orderProfile.images[0].url,/\/badge-image\//);
});
