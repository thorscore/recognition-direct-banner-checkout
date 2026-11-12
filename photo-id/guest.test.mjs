import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {configurePhotoOrders} from './index.mjs';
import {STAFF_EMAIL} from './auth.mjs';
import {samplePortrait} from '../photo-id-pilot/fixtures.mjs';

async function fixture(){
 let handler,paid=false,clock=Date.now();const mail=[],creates=[];
 const server=createServer((req,res)=>{void handler.handle(req,res,new URL(req.url,base));});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port,root=base+'/photo-id';
 const shopify={configured:true,async preflight(run){return run.delivery==='troy'?{locationId:'gid://shopify/Location/97024180520'}:null;},async create(run){creates.push(run);return 'gid://shopify/DraftOrder/'+creates.length;},async read(run){return {paid,checkoutUrl:'https://recognition-direct.com/123/invoices/synthetic',...(paid?{orderName:'#SAMPLE',orderId:'gid://shopify/Order/123',totalCents:run.subtotalCents}:{})};}};
 handler=await configurePhotoOrders({databasePath:':memory:',base,testing:true,shopify,send:async m=>mail.push(m),now:()=>clock});
 const client=()=>{const c={cookie:'',csrf:''};c.call=async(path,data,raw)=>{const headers={Cookie:c.cookie};if(data!==undefined||raw){Object.assign(headers,{Origin:base,'X-Photo-Session':c.csrf,'Content-Type':raw?'image/png':'application/json'});if(raw)headers['X-Photo-Role']='portrait';}const r=await fetch(root+path,{method:data!==undefined||raw?'POST':'GET',headers,body:raw??(data===undefined?undefined:JSON.stringify(data))});const cookie=r.headers.get('set-cookie');if(cookie)c.cookie=cookie.split(';')[0];return r;};c.session=async()=>{const r=await c.call('/api/session');const s=await r.json();c.csrf=s.session;return s;};return c;};
 async function guest(){const c=client(),r=await c.call('/api/guest',{staff:true,email:STAFF_EMAIL});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);const s=await c.session();assert.equal(s.guest,true);assert.equal(s.staff,false);assert.equal(s.owner,'');return c;}
 async function login(c,email){clock+=61_000;const r=await c.call('/api/code',{email}),challenge=(await r.json()).challenge;assert.equal(r.status,200);const code=mail.at(-1).text.match(/\b\d{8}\b/)[0];const v=await c.call('/api/verify',{challenge,code});assert.equal(v.status,200);await c.session();return c;}
 async function design(c,{sides='front-only',delivery='ship'}={}){let j=await(await c.call('/api/jobs',{})).json();const image=await c.call('/api/jobs/'+j.id+'/assets',undefined,await samplePortrait());assert.equal(image.status,201);const photo=await image.json();Object.assign(j.document.people[0],{firstLine:'ALEX',secondLine:'RIVERA',photo:photo.id});Object.assign(j.document,{printSides:sides,backText:sides==='front-and-back'?'Sample return message':'',delivery});const r=await c.call('/api/jobs/'+j.id,{expectedRevision:1,document:j.document});assert.equal(r.status,200);j=await r.json();return {job:j,photo};}
 return {guest,login,client,design,mail,creates,setPaid(){paid=true;},async close(){await new Promise(r=>server.close(r));handler.close();}};
}

test('Guest ordering works for front-only shipping and two-sided pickup without a sign-in code',async()=>{
 const f=await fixture();try{for(const [sides,delivery,unit] of [['front-only','ship',1250],['front-and-back','troy',1550]]){
  const c=await f.guest(),{job:j,photo}=await f.design(c,{sides,delivery});assert.equal(f.mail.length,0);
  const preview=await c.call('/api/jobs/'+j.id+'/preview',{document:j.document,personIndex:0});assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/application\/pdf/);
  const invalid=await c.call('/api/jobs/'+j.id+'/checkout',{expectedRevision:j.revision});assert.equal(invalid.status,422);assert.equal(f.creates.length,sides==='front-only'?0:1);
  const checkout=await c.call('/api/jobs/'+j.id+'/checkout',{expectedRevision:j.revision,email:'buyer@example.test',staff:true,contact:{name:'Sample Buyer',company:'Sample Organization',phone:'(619) 555-0123'}});assert.equal(checkout.status,200);const order=await checkout.json();assert.equal(order.email,'buyer@example.test');assert.equal(order.checkout.paid,false);assert.equal(order.contact.name,'Sample Buyer');assert.deepEqual(f.creates.at(-1).contact,order.contact);assert.equal((await(await c.call('/api/jobs/'+j.id)).json()).contact.phone,'(619) 555-0123');assert.equal(f.creates.at(-1).unitCents,unit);assert.equal(f.creates.at(-1).delivery,delivery);assert.equal(f.mail.length,0);
  const other=await f.guest();assert.equal((await other.call('/api/jobs/'+j.id)).status,404);assert.equal((await other.call('/api/assets/'+photo.id)).status,404);assert.equal((await c.call('/api/assets/'+photo.id+'/original')).status,403);assert.equal((await c.call('/api/jobs/'+j.id+'/prepare-proof',{})).status,403);assert.equal((await c.session()).staff,false);
 }}finally{await f.close();}
});

test('Optional email sign-in saves the current guest design and reopens it from another browser',async()=>{
 const f=await fixture();try{const c=await f.guest(),{job:j,photo}=await f.design(c);assert.equal(f.mail.length,0);await f.login(c,'buyer@example.test');assert.equal((await c.session()).guest,false);assert.equal((await c.call('/api/jobs/'+j.id)).status,200);
  const second=await f.login(f.client(),'buyer@example.test');const list=await(await second.call('/api/jobs')).json();assert.equal(list.length,1);assert.equal(list[0].id,j.id);assert.equal(list[0].document.people[0].photo,photo.id);
  const stranger=await f.guest();assert.equal((await stranger.call('/api/jobs/'+j.id)).status,404);assert.equal((await stranger.call('/api/assets/'+photo.id)).status,404);
 }finally{await f.close();}
});

test('Guest-paid proofs still require staff sending, work for the original guest, and recover by verified email',async()=>{
 const f=await fixture();try{const c=await f.guest(),{job:j}=await f.design(c,{sides:'front-and-back',delivery:'troy'});await c.call('/api/jobs/'+j.id+'/checkout',{expectedRevision:j.revision,email:'buyer@example.test'});f.setPaid();assert.equal((await c.call('/api/jobs/'+j.id+'/sync',{})).status,200);
  const staff=await f.login(f.client(),STAFF_EMAIL);const prepared=await staff.call('/api/jobs/'+j.id+'/prepare-proof',{});assert.equal(prepared.status,200);const p=await prepared.json();assert.equal((await c.call('/api/proofs/'+p.id)).status,404);
  assert.equal((await staff.call('/api/proofs/'+p.id+'/send',{reviewed:true,pdfHash:p.pdfHash})).status,200);assert.match(f.mail.at(-1).text,/https:\/\/recognition-direct\.com\/pages\/photo-id-badges#proof=/);assert.equal(f.mail.at(-1).to,'buyer@example.test');
  assert.equal((await c.call('/api/proofs/'+p.id)).status,200);const stranger=await f.guest();assert.equal((await stranger.call('/api/proofs/'+p.id)).status,404);
  const phone=await f.login(f.client(),'buyer@example.test');assert.equal((await phone.call('/api/proofs/'+p.id)).status,200);assert.equal((await phone.call('/api/proofs/'+p.id+'/decision',{pdfHash:p.pdfHash,confirmed:true,decision:'approved',note:''})).status,200);
  assert.equal((await c.call('/api/jobs/'+j.id+'/production.pdf')).status,403);assert.equal((await staff.call('/api/jobs/'+j.id+'/production.pdf')).status,200);
 }finally{await f.close();}
});
