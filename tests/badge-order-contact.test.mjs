import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeBadgeContact,badgeContactShopifyFields,badgeContactNote} from '../badge-order-contact.mjs';
test('contact name is required while company and phone are optional; legacy clients remain compatible',()=>{
 assert.equal(normalizeBadgeContact(undefined),undefined);
 assert.deepEqual(normalizeBadgeContact({name:' Alex Sample '}),{name:'Alex Sample',company:'',phone:''});
 assert.deepEqual(badgeContactShopifyFields(undefined),{});
 for(const value of [{},null,[],{name:''},{name:'Alex',staff:true},{name:'Alex\nSmith'},{name:'Alex',company:'X'.repeat(161)}])assert.throws(()=>normalizeBadgeContact(value));
});
test('phone numbers are preserved as entered with a native Shopify phone when safely normalized',()=>{
 const contact=normalizeBadgeContact({name:'Alex Sample',company:'Sample Company',phone:'(619) 555-0123'});
 const fields=badgeContactShopifyFields(contact);assert.equal(fields.phone,'+16195550123');
 assert.deepEqual(fields.customAttributes,[{key:'Order company',value:'Sample Company'},{key:'Order contact name',value:'Alex Sample'},{key:'Order contact phone',value:'(619) 555-0123'}]);
 assert.match(badgeContactNote(contact),/Order contact name: Alex Sample/);
 for(const phone of ['+44 20 7946 0123','619-555-0123 ext. 24','555-0123'])assert.equal(normalizeBadgeContact({name:'Alex',phone}).phone,phone);
 assert.equal(badgeContactShopifyFields(normalizeBadgeContact({name:'Alex',phone:'619-555-0123 ext. 24'})).phone,undefined);
 for(const phone of ['not a number','123','++16195550123','619\n5550123'])assert.throws(()=>normalizeBadgeContact({name:'Alex',phone}),/CONTACT_/);
});
