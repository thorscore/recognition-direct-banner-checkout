import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const array = name => source.match(new RegExp(`const DEFAULT_NAME_BADGE_${name}_PRICE_BREAKS = "([^"]+)"`))[1].split(',').map(item => {const [minimumQuantity,unitPrice] = item.split(':').map(Number); return {minimumQuantity,unitPrice};});

function fixture(expressOne) {
  const data = new FormData();
  for (const [key,value] of Object.entries({order_quantity:'25',badge_size:'1x3',badge_color:'white',badge_frame:'no-frame',badge_fastener:'magnetic',badge_finish:'standard',delivery_method:'pickup-la-mesa',email:'test@example.invalid',badge_names:'Test Person',notes:'Release 5 now; hold 20.'})) data.set(key,value);
  if (expressOne) data.set('express_one','yes');
  const captured = {};
  const context = vm.createContext({
    NAME_BADGE_BASE_PRICE_BREAKS:array('BASE'),NAME_BADGE_NO_FRAME_PRICE_BREAKS:array('NO_FRAME'),NAME_BADGE_MAGNET_PRICE_BREAKS:array('MAGNET'),NAME_BADGE_DOME_PRICE_BREAKS:array('DOME'),
    field:(form,key) => String(form.get(key) ?? ''),readPositiveNumber:Number,
    ALLOWED_ORIGINS:new Set(),requestFormData:async () => data,deliveryMethodLabel:() => 'La Mesa Pickup',
    saveUpload:async () => '',shippingPlan:() => ({label:'Pickup'}),attribute:(key,value) => value ? {key,value}:null,shippingAttributes:() => [],
    randomUUID:() => 'offline-badge-test',writeFile:async () => {},join:(...parts) => parts.join('/'),ORDER_DIR:'test-only',
    shippingTags:() => [],draftOrderPickupAddress:() => ({}),draftOrderShippingLine:() => ({}),
    addCustomOrderToCart:async (_req,_res,record,input) => Object.assign(captured,{record,input}),
  });
  vm.runInContext(source.slice(source.indexOf('function priceForQuantity('),source.indexOf('const DEFAULT_EXPRESS_ONE_CUSTOMERS =')),context);
  vm.runInContext(source.slice(source.indexOf('function nameBadgeUnitPrice('),source.indexOf('async function readRequestBody(')),context);
  vm.runInContext(source.slice(source.indexOf('async function handleNameBadgeCheckout('),source.indexOf('async function handleCustomNameBadgeInquiry(')),context);
  return {context,captured,data};
}

test('quantity prices and extras remain unchanged at all eight tiers', () => {
  const {context} = fixture(false);
  for (const [quantity,base,frame,magnet,dome] of [[1,8,12,2.25,4],[10,7.5,11.5,2.25,4],[25,7,11,2.25,4],[50,6,10,2.25,3.5],[100,5.5,9.5,1.9,3.5],[250,5.25,8.75,1.9,3],[500,5,8.5,1.75,2.5],[1000,4.5,8,1.5,2.5]]) {
    assert.equal(context.nameBadgeUnitPrice(quantity,'no-frame','pin','standard'),base);
    assert.equal(context.nameBadgeUnitPrice(quantity,'gold-frame','magnetic','epoxy-dome'),Number((frame+magnet+dome).toFixed(2)));
  }
  assert.throws(() => context.nameBadgeUnitPrice(1500,'no-frame','pin','standard'),/by quote/);
});

test('Express One opt-in, names and release notes survive saved order and Shopify handoff without changing price', async () => {
  for (const enabled of [false,true]) {
    const {context,captured} = fixture(enabled);
    await context.handleNameBadgeCheckout({headers:{}},{});
    assert.equal(captured.record.expressOne,enabled);
    assert.equal(captured.record.totalPrice,231.25);
    const attrs = captured.input.lineItems[0].customAttributes;
    assert.equal(attrs.find(a => a.key === 'Express One').value,enabled ? 'Yes - hold extra badge stock and ship releases as needed':'No');
    assert.equal(attrs.find(a => a.key === 'Notes').value,'Release 5 now; hold 20.');
    assert.equal(attrs.find(a => a.key === 'Names / Badge Text').value,'Test Person');
    assert.equal(captured.input.lineItems[0].quantity,25);
  }
});

test('customer-facing Express One copy does not promise initial-order rush or per-release billing', () => {
  const page = source.slice(source.indexOf('function nameBadgePageHtml()'),source.indexOf('function customNameBadgePageHtml()'));
  assert.doesNotMatch(page,/invoiced after those badges are sent/);
  assert.ok(page.includes('when your held inventory is used up'));
  assert.ok(page.includes('This timing does not apply to the initial stock order'));
});
