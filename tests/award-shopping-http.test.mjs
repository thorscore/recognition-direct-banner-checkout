import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {cp,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

test('award price and cart integration preserve selected SKU, volume price, personalization, files and permitted delivery', {timeout:30000},async()=>{
  const root=new URL('../',import.meta.url);
  const dir=await mkdtemp(join(tmpdir(),'rd-award-test-'));
  let child;
  try{
    for(const entry of await readdir(root,{withFileTypes:true})) if(entry.isFile()&&entry.name.endsWith('.mjs')||['catalog','public'].includes(entry.name)) await cp(new URL(entry.name,root),join(dir,entry.name),{recursive:true});
    const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
    const base=`http://127.0.0.1:${port}`;
    child=spawn(process.execPath,[join(dir,'server.mjs')],{cwd:dir,env:{...process.env,PORT:String(port),APP_BASE_URL:base,MOCK_SHOPIFY:'true',EXPRESS_ONE_ENABLED:'false',SHOPIFY_CLIENT_ID:'',SHOPIFY_CLIENT_SECRET:'',SHOPIFY_ACCESS_TOKEN:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{child.stdout.on('data',c=>{if(String(c).includes('listening on'))resolve();});child.on('error',reject);child.on('exit',c=>reject(new Error('Mock exited '+c)));});
    for(const path of ['/acrylic-awards','/award-plaques','/baseball-softball-resin-trophies','/soccer-resin-trophies']){
      const html=await (await fetch(base+path)).text();assert.match(html,/data-award-shopping="1"/);assert.match(html,/Personalization/);assert.doesNotMatch(html,/pickup-la-mesa|pickup-pine-valley/);
    }
    for(const sku of ['UNT10BK','UNT10BU','UNT11BK','UNT11BU']){
      const html=await(await fetch(base+'/acrylic-awards?sku='+sku)).text();const data=JSON.parse(html.match(/id="award-shopping-data">(.*?)<\/script>/s)[1]);assert.equal(data.initialSku,sku);assert.equal(data.invalidSku,false);
    }
    async function post(path,values,files={}){
      const data=new FormData();for(const [k,v]of Object.entries(values)) data.set(k,v);for(const [k,v]of Object.entries(files))data.set(k,v.blob,v.name);
      const response=await fetch(base+path,{method:'POST',body:data,headers:{Accept:'application/json'}});return {status:response.status,body:await response.json()};
    }
    for(const [q,unit]of [[1,70.63],[6,61.5],[30,59.13],[60,56.5]]){
      const result=await post('/api/premier-award-price',{catalog:'acrylic',sku:'UNT10BU',order_quantity:String(q),unitPrice:'0.01'});
      assert.equal(result.status,200);assert.equal(result.body.unitPrice,unit);assert.equal(result.body.totalPrice,Number((q*unit).toFixed(2)));
    }
    assert.equal((await post('/api/premier-award-price',{catalog:'acrylic',sku:'invalid',order_quantity:'1'})).status,400);
    const values={catalog:'acrylic',sku:'UNT10BU',order_quantity:'6',email:'test@example.invalid',name:'TEST ONLY',plate_text:'TEST ONLY\nSample Recipient',need_by:'2026-12-01',notes:'Do not produce',delivery_method:'pickup-spring-valley'};
    const result=await post('/api/premier-award-checkout',values,{names_file:{blob:new Blob(['Name\nSample Recipient'],{type:'text/csv'}),name:'test-names.csv'},artwork:{blob:new Blob(['TEST ONLY'],{type:'image/png'}),name:'test-logo.png'}});
    assert.equal(result.status,200,JSON.stringify(result.body));
    const cart=JSON.parse(await readFile(join(dir,'data','custom-carts',result.body.cartId+'.json'),'utf8'));
    const line=cart.items[0].draftInput.lineItems[0];assert.equal(line.quantity,6);assert.equal(line.originalUnitPriceWithCurrency.amount,'61.50');
    const attrs=Object.fromEntries(line.customAttributes.map(a=>[a.key,a.value]));assert.equal(attrs.SKU,'UNT10BU');assert.equal(attrs.Option,'Blue');assert.equal(attrs['Plate / Personalization Text'].replace(/\r\n/g,'\n'),values.plate_text);assert.ok(attrs['Names File']);assert.ok(attrs['Logo / Artwork']);
    const review=await (await fetch(base+'/custom-order-cart?cart='+result.body.cartId)).text();assert.match(review,/UNT10BU/);assert.match(review,/Sample Recipient/);assert.match(review,/Attached/);assert.match(review,/369.00/);assert.match(review,/Not applicable \(pickup\)/);assert.ok(!review.includes(attrs['Names File']));
    for(const delivery_method of ['pickup-la-mesa','pickup-pine-valley']) assert.equal((await post('/api/premier-award-checkout',{...values,delivery_method})).status,400);
    assert.equal((await post('/api/premier-award-checkout',{...values,delivery_method:'ship'})).status,200);
  }finally{
    if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
    await rm(dir,{recursive:true,force:true});
  }
});
