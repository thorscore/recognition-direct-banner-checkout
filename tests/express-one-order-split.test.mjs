import test from 'node:test';
import assert from 'node:assert/strict';
import { expressOneOrderSplit } from '../express-one-order-split.mjs';
import { customCartReviewLines } from '../custom-cart-review.mjs';

const form = values => { const f=new FormData(); for(const [k,v] of Object.entries(values)) f.set(k,v); return f; };
test('standard and legacy Express One forms remain compatible',()=>{
  assert.equal(expressOneOrderSplit(form({express_one:'no',express_one_now:'invalid'}),25),null);
  assert.equal(expressOneOrderSplit(form({express_one:'yes'}),25),null);
});
test('zero-now and zero-held orders retain explicit zero quantities',()=>{
  assert.deepEqual(expressOneOrderSplit(form({express_one:'yes',express_one_now:'0',express_one_held:'25'}),25),{neededNow:0,heldForLater:25});
  assert.deepEqual(expressOneOrderSplit(form({express_one:'yes',express_one_now:'25',express_one_held:'0'}),25),{neededNow:25,heldForLater:0});
});
test('missing, fractional, negative, unsafe and mismatched counts are rejected',()=>{
  for(const [now,held] of [['','25'],['1.5','23.5'],['-1','26'],['9007199254740992','0'],['5','19'],['26','0']]) {
    assert.throws(()=>expressOneOrderSplit(form({express_one:'yes',express_one_split_version:'1',express_one_now:now,express_one_held:held}),25));
  }
  assert.throws(()=>expressOneOrderSplit(form({express_one:'yes',express_one_split_version:'1'}),25));
});
test('cart review exposes badge choices, split, text and attachments without upload URLs',()=>{
  const attrs=[['Badge Size','1 x 3'],['Badge Color','White'],['Frame','Gold'],['Fastener','Magnetic'],['Finish','Epoxy Dome'],['Badges Needed Now','5'],['Badges Held for Later','20'],['Names / Badge Text','QA PERSON'],['Names File','https://example.com/private-names.csv'],['Artwork','https://example.com/private-logo.png']].map(([key,value])=>({key,value}));
  const [line]=customCartReviewLines({draftInput:{tags:['name-badges'],lineItems:[{title:'Name Badges',quantity:25,customAttributes:attrs}]}});
  assert.equal(line.size,'1 x 3');
  assert.equal(line.details.find(a=>a.label==='Badges Held for Later').value,'20');
  assert.equal(line.details.find(a=>a.label==='Names File').value,'Attached');
  assert.ok(!JSON.stringify(line).includes('private-'));
});
