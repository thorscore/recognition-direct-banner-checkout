import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {AWARD_DETAIL_PAGES,AWARD_CATEGORY_LINKS,awardPageUrl} from '../award-pages.mjs';
import {buildAwardDetailPage} from '../award-detail-renderer.mjs';
import {awardDetailsUrl,initialAwardSelection} from '../award-pilot.mjs';
import {groupAwardStyles,awardShoppingPageHtml} from '../award-shopping.mjs';
const files={acrylic:'acrylic-awards',plaques:'award-plaques',soccer:'soccer-resin-trophies','baseball-softball':'baseball-softball-resin-trophies'};
const catalogs=Object.fromEntries(await Promise.all(Object.entries(files).map(async([id,file])=>[id,JSON.parse((await readFile(new URL('../catalog/premier-'+file+'.json',import.meta.url),'utf8')).replace(/^\uFEFF/,'')).products])));
test('all detail-page options preserve source images, nonzero prices, SKU routing and structured offers',async()=>{
 const seen=new Set();
 for(const config of AWARD_DETAIL_PAGES){
  const products=catalogs[config.catalog],before=JSON.stringify(products),page=await buildAwardDetailPage(config,products);
  const groups=groupAwardStyles(products,p=>({unitPrice:p.prices.lessThanCase}));
  assert.equal(page.options.length,config.options.length);assert.ok(page.description.length<=140);assert.ok(!seen.has(page.handle));seen.add(page.handle);
  for(const option of page.options){
   const original=products.find(p=>p.sku===option.sku),variant=page.structuredData.hasVariant.find(v=>v.sku===option.sku);
   assert.equal(option.price,original.prices.lessThanCase);assert.equal(variant.offers.price,option.price.toFixed(2));assert.equal(option.image,original.image);
   assert.equal(initialAwardSelection(groups,option.sku).product.sku,option.sku);assert.equal(awardDetailsUrl(option.sku),awardPageUrl(config));
   assert.ok(page.body.includes(AWARD_CATEGORY_LINKS[config.catalog].route+'?sku='+option.sku));assert.ok(page.body.includes('id="'+option.sku+'"'));
  }
  assert.match(page.body,/8680 Troy St\., Spring Valley, CA 91977/);assert.doesNotMatch(page.body,/Pine Valley|La Mesa|InStock|aggregateRating|availableQuantity|\"costs\"/);
  assert.equal(JSON.stringify(products),before);
  await assert.rejects(buildAwardDetailPage(config,products.filter(p=>p.sku!==config.options[0].sku)),/Missing verified award option/);
 }
});
test('catalogs expose normal guide links and server-render every requested variant correctly',()=>{
 for(const [id,products]of Object.entries(catalogs)){
  const pages=AWARD_DETAIL_PAGES.filter(p=>p.catalog===id);
  for(const page of pages)for(const option of page.options){
   const html=awardShoppingPageHtml({catalog:{id,title:'Test',metaDescription:'Test',products},appBaseUrl:'http://localhost',pickupLabel:'Troy St.',tierFor:p=>({unitPrice:p.prices.lessThanCase}),seoTags:'',cartScript:'',selectedSku:option.sku});
   const data=JSON.parse(html.match(/id="award-shopping-data">(.*?)<\/script>/s)[1]);assert.equal(data.initialSku,option.sku);assert.equal(data.invalidSku,false);
   for(const p of pages)assert.ok(html.includes('href="'+awardPageUrl(p)+'" target="_top"'));
  }
 }
});
