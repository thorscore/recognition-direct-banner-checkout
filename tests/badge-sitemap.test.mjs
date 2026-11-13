import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {BADGE_SITEMAP_PATH,badgeSitemapXml,serveAwardSitemap} from '../award-sitemap.mjs';

test('the supplemental badge sitemap contains exactly the two missing public canonical pages',()=>{
 const xml=badgeSitemapXml();
 const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 assert.deepEqual(urls,[
  'https://recognition-direct.com/pages/express-one-name-badges',
  'https://recognition-direct.com/pages/employee-badge-ordering-guide',
 ]);
 assert.equal(new Set(urls).size,2);
 assert.match(xml,/^<\?xml version="1.0" encoding="UTF-8"\?>/);
 assert.match(xml,/<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
 assert.doesNotMatch(xml,/checkout\.|localhost|127\.0\.0\.1|preview_theme|photo-id-pilot|job=|<lastmod>|<priority>/);
});

test('GET and HEAD expose public XML only; other methods and private routes are not handled',async()=>{
 const server=createServer((req,res)=>{
  if(serveAwardSitemap(req,res,new URL(req.url,'http://localhost')))return;
  res.writeHead(404);res.end('not a sitemap');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const method of ['GET','HEAD']){
   const response=await fetch(origin+BADGE_SITEMAP_PATH+'?email=synthetic-private-test&job=private-test',{method});
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'application/xml; charset=utf-8');
   assert.equal(Number(response.headers.get('content-length')),Buffer.byteLength(badgeSitemapXml()));
   assert.equal(response.headers.get('x-robots-tag'),null);
   const body=await response.text();
   assert.equal(body,method==='GET'?badgeSitemapXml():'');
   assert.doesNotMatch(body,/synthetic-private-test|private-test/);
  }
  for(const [method,route]of [['POST',BADGE_SITEMAP_PATH],['DELETE',BADGE_SITEMAP_PATH],['GET','/photo-id-pilot'],['GET','/badge-production'],['POST','/api/catalog-checkout']]){
   const response=await fetch(origin+route,{method});assert.equal(response.status,404);
  }
 }finally{server.close();server.closeAllConnections();await once(server,'close');}
});
