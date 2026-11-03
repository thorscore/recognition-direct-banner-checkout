import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {AWARD_PILOT_OPTIONS,AWARD_PILOT_URL,awardDetailsUrl,buildAwardPilotPage,initialAwardSelection} from '../award-pilot.mjs';
import {groupAwardStyles,awardShoppingPageHtml} from '../award-shopping.mjs';
const products=JSON.parse(await readFile(new URL('../catalog/premier-acrylic-awards.json',import.meta.url),'utf8')).products;
const groups=groupAwardStyles(products,p=>({unitPrice:p.prices.lessThanCase}));

test('all four pilot links select the exact original SKU, image and price without replacing the catalog',()=>{
  for(const {sku}of AWARD_PILOT_OPTIONS){const selected=initialAwardSelection(groups,sku);const original=products.find(p=>p.sku===sku);assert.equal(selected.invalid,false);assert.equal(selected.product.sku,sku);assert.equal(selected.product.image,original.image);assert.equal(selected.product.priceAtOne,original.prices.lessThanCase);assert.equal(selected.group.variants.length,4);assert.equal(awardDetailsUrl(sku),AWARD_PILOT_URL);}
  assert.equal(awardDetailsUrl('CIA2C'),'');assert.equal(initialAwardSelection(groups,'').product.sku,products[0].sku);assert.equal(initialAwardSelection(groups,'<bad>').invalid,true);
});

test('pilot page exposes full crawlable content, exact per-option links and matching structured offers',async()=>{
  const before=JSON.stringify(products);const page=await buildAwardPilotPage(products);
  assert.equal(page.options.length,4);assert.equal(page.structuredData.hasVariant.length,4);assert.ok(page.description.length<=140);
  for(const option of page.options){const p=products.find(p=>p.sku===option.sku);const variant=page.structuredData.hasVariant.find(v=>v.sku===option.sku);assert.equal(Number(variant.offers.price),p.prices.lessThanCase);assert.ok(page.body.includes(`?sku=${option.sku}`));assert.ok(page.body.includes(`id="${option.sku}"`));assert.ok(page.body.includes('$'+p.prices.lessThanCase.toFixed(2)));assert.ok(page.body.includes(p.image));}
  assert.match(page.body,/8680 Troy St\., Spring Valley, CA 91977/);assert.doesNotMatch(page.body,/Pine Valley|La Mesa|InStock|aggregateRating|reviewRating|availableQuantity|costs/);
  assert.match(page.body,/https:\/\/checkout\.recognition-direct\.com\/acrylic-awards\?sku=UNT11BU/);
  assert.equal(JSON.stringify(products),before);
});

test('missing or free pilot options prevent publication of an incorrect price page',async()=>{
  await assert.rejects(buildAwardPilotPage(products.filter(p=>p.sku!=='UNT11BU')),/Missing verified pilot option/);
  await assert.rejects(buildAwardPilotPage(products.map(p=>p.sku==='UNT10BK'?{...p,prices:{lessThanCase:0}}:p)),/Missing verified pilot option/);
});

test('server-rendered requested award is visible before scripts run and unknown SKUs stay explicitly invalid',()=>{
  const render=selectedSku=>awardShoppingPageHtml({catalog:{id:'acrylic',title:'Acrylic Awards',metaDescription:'test',products},appBaseUrl:'http://localhost',pickupLabel:'Troy St.',tierFor:p=>({unitPrice:p.prices.lessThanCase}),seoTags:'',cartScript:'',selectedSku});
  const html=render('UNT11BU');const data=JSON.parse(html.match(/id="award-shopping-data">(.*?)<\/script>/s)[1]);assert.equal(data.initialSku,'UNT11BU');assert.equal(data.invalidSku,false);assert.match(html,/<h2 id="selected-title"[^>]*>8&quot; Blue Unite Diamond Ice Acrylic<\/h2>/);assert.match(html,/View this award’s sizes/);
  const invalid=render('</script><script>bad()</script>');const invalidData=JSON.parse(invalid.match(/id="award-shopping-data">(.*?)<\/script>/s)[1]);assert.equal(invalidData.invalidSku,true);assert.equal(invalidData.requestedSku,'</script><script>bad()</script>');
});
