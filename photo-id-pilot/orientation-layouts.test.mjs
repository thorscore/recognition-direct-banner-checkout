import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {newDocument,checkDocument} from './document.mjs';
import {cardGeometry,normalizeOrientation} from './shared/card-geometry.mjs';
import {DESIGN_OPTIONS,LAYOUT_ID,layoutFor} from './shared/layout.mjs';
import {mountingGeometry,logoPosition,slotBounds} from './shared/slot-geometry.mjs';
import {cardPdf,proofPdf} from './pdf.mjs';
import {samplePortrait,sampleLogo} from './fixtures.mjs';
import {createPilotStore} from './store.mjs';

const fixture=Promise.all([samplePortrait(),sampleLogo()]).then(([photo,logo])=>new Map([
 ['a'.repeat(32),{normalized:photo,width:900,height:1200}],
 ['b'.repeat(32),{normalized:logo,width:1200,height:180}]
]));
const document=()=>{const d=newDocument();d.people[0].firstLine='JAMIE';d.people[0].secondLine='RIVERA';d.organization='SAMPLE COMPANY';d.people[0].photo='a'.repeat(32);d.logo='b'.repeat(32);d.backText='If found, please return to Sample Company.';return d;};
const boxes=bytes=>[...bytes.toString('latin1').matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(m=>m[1].trim().split(/\s+/).map(Number));
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

test('The five layout choices support portrait and landscape with unchanged badge prices',()=>{
 assert.equal(DESIGN_OPTIONS.length,5);assert.equal(DESIGN_OPTIONS[0].id,LAYOUT_ID);
 for(const layout of DESIGN_OPTIONS)for(const orientation of ['landscape','portrait'])for(const [side,price]of [['front-only',1250],['front-and-back',1550]]){
  const d=document();Object.assign(d,{layout:layout.id,orientation,printSides:side});const checked=checkDocument(d,{complete:true});assert.equal(checked.price.unitCents,price);assert.equal(checked.document.orientation,orientation);assert.equal(layoutFor(d).label,layout.label);
 }
 assert.equal(normalizeOrientation('horizontal'),'landscape');assert.equal(normalizeOrientation('vertical'),'portrait');
 for(const bad of ['square','diagonal',null,12]){const d=document();d.orientation=bad;assert.throws(()=>checkDocument(d),e=>e.code==='BADGE_DETAILS_INVALID');}
 const d=document();d.layout='untrusted-layout';assert.throws(()=>checkDocument(d),e=>e.code==='BADGE_DETAILS_INVALID');
});

test('All ten upright layouts produce the selected physical trim and paired front/back pages',async()=>{
 const assets=await fixture;
 for(const layout of DESIGN_OPTIONS)for(const orientation of ['landscape','portrait'])for(const side of ['front-only','front-and-back']){
  const d=document();Object.assign(d,{layout:layout.id,orientation,printSides:side});const pdf=await cardPdf(d,assets),g=cardGeometry(d),pages=boxes(pdf);
  assert.equal(pages.length,side==='front-only'?1:2,layout.id+' '+orientation+' '+side);
  for(const box of pages)assert.deepEqual(box,[0,0,g.trimWidth,g.trimHeight]);
 }
});

test('Slots stay centered at the same physical top gap and never intersect logo or portrait content',()=>{
 for(const layout of DESIGN_OPTIONS)for(const orientation of ['landscape','portrait']){
  const d=document();Object.assign(d,{layout:layout.id,orientation,attachment:'lanyard',punch:'punch'});const g=cardGeometry(d),f=layoutFor(d),mount=mountingGeometry(d.attachment,d.punch,d),s=mount.slot;
  assert.equal(s.centerX,g.widthInches/2);assert.equal(s.y,1/8);assert.equal(s.width,9/16);assert.equal(s.height,1/8);
  assert.deepEqual(slotBounds({orientation,side:'front'}),slotBounds({orientation,side:'back'}));
  const px={x:s.x*288,y:s.y*288,width:s.width*288,height:s.height*288};assert.equal(overlap(px,{x:f.photo.x,y:f.photo.y,width:f.photo.w,height:f.photo.h}),false);
  for(const [w,h]of [[1200,180],[300,900],[4000,40]])for(const scale of [25,100,150])assert.equal(overlap(px,logoPosition(w,h,scale,true,d)),false,layout.id+' '+orientation);
 }
});

test('Every orientation/layout creates readable proof pages with the actual card size and layout metadata',async()=>{
 const assets=await fixture;const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 for(const layout of DESIGN_OPTIONS)for(const orientation of ['landscape','portrait']){
  const d=document();Object.assign(d,{layout:layout.id,orientation,printSides:'front-and-back',attachment:'lanyard',punch:'punch'});
  const bytes=await proofPdf(d,assets,{id:'SAMPLE-JOB',revision:2,subtotalCents:1750}),task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,verbosity:0});
  try{const pdf=await task.promise;let text='';for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);assert.equal(page.view[2],612);assert.equal(page.view[3],792);text+=' '+(await page.getTextContent()).items.map(i=>i.str).join(' ');}const g=cardGeometry(d);assert.ok(text.includes(`${g.widthInches} x ${g.heightInches} in`));assert.ok(text.includes(layout.label));assert.ok(text.includes('JAMIE'));assert.ok(text.includes('FRONT'));assert.ok(text.includes('BACK'));assert.ok(text.includes('Badge subtotal'));}finally{await task.destroy();}
 }
});

test('Old saved landscapes and their approvals are untouched until a real design change is saved',async()=>{
 const db=new DatabaseSync(':memory:'),shopify={configured:true,async preflight(){return null},async create(){return 'gid://shopify/DraftOrder/123456'},async read(){return {paid:true,orderName:'#SAMPLE',totalCents:1250,checkoutUrl:'https://recognition-direct-id-badge-test.myshopify.com/84098253013/invoices/sample'}}};
 const store=createPilotStore({db,shopify,base:'https://example.test',send:async()=>{}});let job=store.create();
 const asset=await store.upload(job.id,{role:'portrait',type:'image/png',bytes:(await fixture).get('a'.repeat(32)).normalized});job.document.people[0].firstLine='ALEX';job.document.people[0].photo=asset.id;delete job.document.orientation;
 const legacy=JSON.stringify(job.document);db.prepare('UPDATE photo_pilot_jobs SET document=? WHERE id=?').run(legacy,job.id);
 assert.equal(JSON.stringify(checkDocument(job.document).document),legacy);job=store.read(job.id);assert.equal(Object.hasOwn(job.document,'orientation'),false);
 await store.checkout(job.id,{expectedRevision:job.revision,fictionalDataConfirmed:true});const proof=await store.prepareProof(job.id);await store.sendProof(proof.id,{pdfHash:proof.pdfHash,reviewed:true});await store.decide(proof.id,{pdfHash:proof.pdfHash,decision:'approved',note:'',confirmed:true});
 const unchanged=store.save(job.id,{expectedRevision:job.revision,document:job.document});assert.equal(unchanged.revision,job.revision);assert.equal(unchanged.proofs[0].superseded,false);assert.equal(unchanged.proofs[0].decision,'approved');
 const changed=structuredClone(job.document);changed.orientation='portrait';changed.layout='clean-header.v1';const saved=store.save(job.id,{expectedRevision:job.revision,document:changed});assert.equal(saved.revision,job.revision+1);assert.equal(saved.proofs[0].superseded,true);await assert.rejects(()=>store.production(job.id),e=>e.code==='LATEST_APPROVED_PROOF_REQUIRED');db.close();
});
