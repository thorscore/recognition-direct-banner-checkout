import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCartDelivery, validateDeliveryMethod } from '../delivery-policy.mjs';

const item = (product, delivery) => ({draftInput:{tags:[product, delivery]}});
test('13oz banners use seasonal sites, while every other product uses Troy St.', () => {
  for (const method of ['ship','pickup-la-mesa','pickup-pine-valley']) assert.equal(validateDeliveryMethod(method,true),method);
  for (const method of ['ship','pickup-spring-valley']) assert.equal(validateDeliveryMethod(method,false),method);
  assert.throws(()=>validateDeliveryMethod('pickup-spring-valley',true),/not available for banners/);
  for (const method of ['pickup-la-mesa','pickup-pine-valley','unknown']) assert.throws(()=>validateDeliveryMethod(method,false),/13oz banners only/);
});
test('shipped banner and nonbanner items share checkout; different delivery choices do not', () => {
  assert.doesNotThrow(()=>assertCartDelivery([item('13oz-vinyl-banner','ship'),item('name-badges','ship')]));
  assert.doesNotThrow(()=>assertCartDelivery([item('solar-placards','pickup-spring-valley'),item('name-badges','pickup-spring-valley')]));
  assert.doesNotThrow(()=>assertCartDelivery([item('13oz-vinyl-banner','pickup-la-mesa'),item('custom-banner','pickup-la-mesa')]));
  for (const methods of [['pickup-la-mesa','pickup-spring-valley'],['ship','pickup-spring-valley']]) {
    assert.throws(()=>assertCartDelivery([item('13oz-vinyl-banner',methods[0]),item('name-badges',methods[1])]),/separate orders/);
  }
});
test('saved carts cannot bypass product-specific pickup rules', () => {
  assert.throws(()=>assertCartDelivery([item('name-badges','pickup-pine-valley')]),/13oz banners only/);
  assert.throws(()=>assertCartDelivery([item('13oz-vinyl-banner','pickup-spring-valley')]),/not available for banners/);
  assert.doesNotThrow(()=>assertCartDelivery([{draftInput:{tags:['league-billed']}}]));
});
