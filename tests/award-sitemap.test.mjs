import assert from 'node:assert/strict';
import test from 'node:test';
import {AWARD_DETAIL_PAGES,awardPageUrl} from '../award-pages.mjs';
import {AWARD_PILOT_URL} from '../award-pilot.mjs';
import {awardSitemapXml,serveAwardSitemap} from '../award-sitemap.mjs';

test('the awards sitemap contains each published detail page once, using its main-domain canonical URL',()=>{
 const xml=awardSitemapXml();const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 assert.deepEqual(urls,[AWARD_PILOT_URL,...AWARD_DETAIL_PAGES.map(awardPageUrl)]);assert.equal(new Set(urls).size,9);
 assert.match(xml,/^<\?xml version="1.0" encoding="UTF-8"\?>/);assert.match(xml,/<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
 assert.doesNotMatch(xml,/checkout\.recognition-direct|\?sku|cart=|<lastmod>|<priority>|<changefreq>/);
});

test('the XML response supports GET and HEAD, excludes request data, and leaves unrelated app routes alone',()=>{
 for(const method of ['GET','HEAD']){
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  assert.equal(serveAwardSitemap({method},res,new URL('https://checkout.recognition-direct.com/awards-sitemap.xml?cart=private-test')),true);
  assert.equal(res.status,200);assert.equal(res.headers['Content-Type'],'application/xml; charset=utf-8');assert.equal(res.headers['X-Robots-Tag'],undefined);
  assert.equal(res.headers['Content-Length'],Buffer.byteLength(awardSitemapXml()));assert.equal(res.body,method==='HEAD'?undefined:awardSitemapXml());
 }
 for(const [method,path]of [['POST','/awards-sitemap.xml'],['GET','/acrylic-awards'],['POST','/api/premier-award-checkout'],['GET','/express-one'],['GET','/custom-order-cart']]){
  assert.equal(serveAwardSitemap({method},{writeHead(){throw Error('Unexpected response');}},new URL(path,'https://checkout.recognition-direct.com')),false);
 }
});
