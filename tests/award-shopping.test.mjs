import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {awardStyleName, groupAwardStyles, awardShoppingPageHtml} from '../award-shopping.mjs';
import {customCartReviewLines} from '../custom-cart-review.mjs';

const catalogs = await Promise.all(['acrylic-awards','award-plaques','baseball-softball-resin-trophies','soccer-resin-trophies'].map(async name => ({name,...JSON.parse((await readFile(new URL('../catalog/premier-'+name+'.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''))})));
const tierFor = p => ({unitPrice:p.prices.lessThanCase});

test('grouping keeps every existing award SKU, option, image and quantity-one price exactly once',()=>{
  for(const catalog of catalogs){
    const before=JSON.stringify(catalog.products);
    const styles=groupAwardStyles(catalog.products,tierFor);
    const variants=styles.flatMap(g=>g.variants);
    assert.equal(variants.length,catalog.products.length,catalog.name);
    assert.equal(new Set(variants.map(p=>p.sku)).size,catalog.products.length,catalog.name);
    for(const p of catalog.products){
      const v=variants.find(v=>v.sku===p.sku);
      assert.equal(v.title,p.displayName || p.title);
      assert.equal(v.image,p.image);assert.equal(v.priceAtOne,p.prices.lessThanCase);
    }
    assert.equal(JSON.stringify(catalog.products),before);
    for(const style of styles) assert.equal(style.fromPrice,Math.min(...style.variants.map(v=>v.priceAtOne)));
  }
});

test('known size/color variants share a style without merging unrelated award shapes',()=>{
  const styles=groupAwardStyles(catalogs[0].products,tierFor);
  const unite=styles.find(g=>g.variants.some(p=>p.sku==='UNT10BK'));
  assert.equal(unite.title,'Unite Diamond Ice Acrylic');
  assert.deepEqual(unite.variants.map(p=>p.sku),['UNT10BK','UNT10BU','UNT11BK','UNT11BU']);
  assert.ok(styles.length<catalogs[0].products.length/2);
  assert.equal(awardStyleName({title:'7x9 Rosewood High Gloss Plaque',optionName:'Color',optionValue:'Rosewood'}),'High Gloss Plaque');
  assert.equal(awardStyleName({displayName:'Soccer Astro Resin-8 3/4"',size:'8 3/4"'}),'Soccer Astro Resin');
  const shapes=groupAwardStyles([{sku:'a',title:'7" Blue Star',optionName:'Color',optionValue:'Blue',productType:'Acrylic',prices:{lessThanCase:20}},{sku:'b',title:'7" Blue Circle',optionName:'Color',optionValue:'Blue',productType:'Acrylic',prices:{lessThanCase:20}}],tierFor);
  assert.equal(shapes.length,2);
});

test('shopping payload exposes no supplier costs or stale inventory and escapes catalog markup',()=>{
  const p={...catalogs[0].products[0],description:'</script><img onerror=bad()>',costs:{private:1},availableQuantity:123};
  const html=awardShoppingPageHtml({catalog:{id:'acrylic',title:'Acrylic Awards',metaDescription:'test',products:[p]},appBaseUrl:'http://localhost',pickupLabel:'Pickup at 8680 Troy St., Spring Valley, CA 91977',tierFor,seoTags:'',cartScript:''});
  const payload=html.match(/<script type="application\/json" id="award-shopping-data">(.*?)<\/script>/s)[1];
  assert.ok(!payload.includes('</script>')); assert.ok(!payload.includes('costs'));assert.ok(!payload.includes('availableQuantity'));
  assert.equal(JSON.parse(payload).groups[0].variants[0].description,p.description);
  assert.match(html,/pickup-spring-valley/);assert.doesNotMatch(html,/pickup-la-mesa|pickup-pine-valley/);
  assert.match(html,/<button class="submit" type="submit" disabled>/);
});

test('award cart review shows exact SKU, wording, option, deadline and attached files without private URLs',()=>{
  for(const tag of ['acrylic-awards','award-plaques','baseball-softball-trophies','soccer-trophies']){
    const [line]=customCartReviewLines({draftInput:{tags:[tag],lineItems:[{title:'Test award',quantity:6,customAttributes:Object.entries({SKU:'UNT10BU',Option:'Blue','Plate / Personalization Text':'TEST ONLY\nRecipient 1','Names File':'https://example.invalid/private.csv','Logo / Artwork':'https://example.invalid/private-logo.png','Need-by Date':'2026-12-01','Delivery Method':'Pickup at 8680 Troy St., Spring Valley, CA 91977','Proof Required':'Yes'}).map(([key,value])=>({key,value}))}]}});
    assert.equal(line.quantity,6);assert.ok(line.details.some(d=>d.value==='UNT10BU'));assert.ok(line.details.some(d=>d.value.includes('Recipient 1')));
    assert.deepEqual(line.details.filter(d=>d.label==='Names File'||d.label==='Logo / Artwork').map(d=>d.value),['Attached','Attached']);
    assert.ok(!JSON.stringify(line).includes('private'));
  }
});
