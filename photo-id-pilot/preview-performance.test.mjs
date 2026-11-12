import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPilotStore} from './store.mjs';
import {createPreviewQueue,previewSnapshot} from './public/preview-queue.mjs';
import {newDocument} from './document.mjs';
import {samplePortrait} from './fixtures.mjs';
import {cardPdf} from './pdf.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function timers(){let next=0;const items=new Map();return {setTimer(fn){items.set(++next,fn);return next;},clearTimer(id){items.delete(id);},flush(){const callbacks=[...items.values()];items.clear();for(const fn of callbacks)fn();}};}
const job=()=>({id:'sample-job',document:newDocument()});

test('Rapid adjustments build only the latest preview and never overlap requests or paint stale results',async()=>{
 const clock=timers(),calls=[],painted=[],releases=[];let active=0,maximum=0;
 const q=createPreviewQueue({...clock,onError:e=>{throw e;},render:async(s,current)=>{calls.push(s.key);maximum=Math.max(maximum,++active);await new Promise(r=>releases.push(r));if(current())painted.push(s.key);active--;}});
 q.schedule({key:'first'});clock.flush();assert.deepEqual(calls,['first']);
 for(let i=0;i<30;i++)q.schedule({key:'drag-'+i});clock.flush();assert.equal(calls.length,1);
 releases.shift()();await tick();assert.deepEqual(calls,['first','drag-29']);assert.deepEqual(painted,[]);
 releases.shift()();await tick();assert.deepEqual(painted,['drag-29']);assert.equal(maximum,1);
 q.schedule({key:'drag-29'});clock.flush();assert.equal(calls.length,2);
});

test('A failed preview can retry; sign-out/navigation cancels pending results and their errors',async()=>{
 const clock=timers(),errors=[],painted=[];let finish;let failed=false;
 const q=createPreviewQueue({...clock,onError:e=>errors.push(e.message),render:async(s,current)=>{if(!failed){failed=true;throw Error('network');}await new Promise(r=>finish=r);if(current())painted.push(s.key);}});
 q.schedule({key:'same'});clock.flush();await tick();assert.deepEqual(errors,['network']);
 q.schedule({key:'same'});clock.flush();await tick();q.cancel();finish();await tick();assert.deepEqual(painted,[]);
 q.schedule({key:'queued'});q.cancel();clock.flush();assert.deepEqual(painted,[]);
 const bad=createPreviewQueue({...clock,onError:e=>errors.push(e.message),render:async()=>{await new Promise(r=>finish=r);throw Error('stale');}});bad.schedule({key:'old'});clock.flush();bad.cancel();finish();await tick();assert.deepEqual(errors,['network']);
});

test('Preview deduplication ignores nonvisual details while snapshots preserve every saved order field',()=>{
 const j=job(),first=previewSnapshot(j,0);j.document.logoNotes='Private production note';j.document.delivery='troy';j.document.lanyardColor='red';j.document.people[0].copies=3;
 const same=previewSnapshot(j,0);assert.equal(same.key,first.key);assert.equal(same.document.logoNotes,'Private production note');assert.equal(same.document.people[0].copies,3);assert.equal(first.document.people[0].copies,1);
 for(const [key,value]of [['logoScale',300],['orientation','portrait'],['logo','b'.repeat(32)],['punch','punch'],['layout','side-stripe.v1'],['printSides','front-and-back']]){const before=previewSnapshot(j,0).key;j.document[key]=value;assert.notEqual(previewSnapshot(j,0).key,before,key);}
 const before=previewSnapshot(j,0).key;j.document.people[0].crop.x=.8;assert.notEqual(previewSnapshot(j,0).key,before);j.document.people.push({...structuredClone(j.document.people[0]),id:crypto.randomUUID()});assert.notEqual(previewSnapshot(j,0).key,previewSnapshot(j,1).key);
 assert.equal(previewSnapshot(null,0),null);assert.equal(previewSnapshot(j,9),null);
});

test('Selected-person display previews use small images without changing originals, saved jobs or full-resolution proof assets',async()=>{
 const db=new DatabaseSync(':memory:'),calls=[],pdfs={async cardPdf(document,assets,options){calls.push({document,assets,options});return Buffer.from('PDF');},async proofPdf(document,assets){calls.push({document,assets,proof:true});return Buffer.from('PROOF');}};
 const store=createPilotStore({db,base:'https://example.test',shopify:{configured:false},send:async()=>{throw Error('No email expected');},pdfs});let j=store.create();
 const source=await samplePortrait(),asset=await store.upload(j.id,{role:'portrait',type:'image/png',bytes:source});const row=db.prepare('SELECT normalized,preview FROM photo_pilot_assets WHERE id=?').get(asset.id);
 j.document.people[0].firstLine='ALEX';j.document.people[0].photo=asset.id;j.document.people.push({...structuredClone(j.document.people[0]),id:crypto.randomUUID(),firstLine:'JAMIE'});j=store.save(j.id,{expectedRevision:j.revision,document:j.document});const saved=JSON.stringify(store.read(j.id)),events=store.eventRows(j.id).length;
 await store.preview(j.id,j.document,{personIndex:1});let call=calls.at(-1);assert.equal(call.document.people.length,1);assert.equal(call.document.people[0].firstLine,'JAMIE');assert.deepEqual(call.assets.get(asset.id).normalized,Buffer.from(row.preview));assert.equal(call.assets.get(asset.id).width,900);assert.equal(call.assets.get(asset.id).height,1200);assert.equal(call.options.guide,true);
 await store.preview(j.id,j.document);assert.equal(calls.at(-1).document.people.length,2);
 for(const personIndex of [-1,2,.5,'1',null])await assert.rejects(()=>store.preview(j.id,j.document,{personIndex}),e=>e.code==='PREVIEW_PERSON_INVALID');
 const another=store.create(),other=await store.upload(another.id,{role:'portrait',type:'image/png',bytes:source}),foreign=structuredClone(j.document);foreign.people[1].photo=other.id;await assert.rejects(()=>store.preview(j.id,foreign,{personIndex:1}),e=>e.code==='ARTWORK_NEEDS_REVIEW');
 assert.equal(JSON.stringify(store.read(j.id)),saved);assert.equal(store.eventRows(j.id).length,events);assert.deepEqual(store.original(asset.id).bytes,source);
 // The unchanged checkout validation still receives the exact full-resolution
 // bytes. Its missing test credential then stops before any Shopify operation.
 await assert.rejects(()=>store.checkout(j.id,{expectedRevision:j.revision,fictionalDataConfirmed:true}),e=>e.code==='TEST_CHECKOUT_SETUP_REQUIRED');call=calls.at(-1);assert.deepEqual(call.assets.get(asset.id).normalized,Buffer.from(row.normalized));
 db.prepare('UPDATE photo_pilot_assets SET source=? WHERE id=?').run(Buffer.from('corrupted'),asset.id);await assert.rejects(()=>store.preview(j.id,j.document,{personIndex:1}),e=>e.code==='ARTWORK_NEEDS_REVIEW');db.close();
});

test('Actual display PDFs show the chosen person and both sides, while a reused PDF.js worker survives document cleanup',async()=>{
 const db=new DatabaseSync(':memory:'),store=createPilotStore({db,base:'https://example.test',shopify:{configured:false},send:async()=>{throw Error('No email expected');}});
 let j=store.create();const source=await samplePortrait(),asset=await store.upload(j.id,{role:'portrait',type:'image/png',bytes:source});Object.assign(j.document,{printSides:'front-and-back',backText:'Sample return instructions',orientation:'portrait',logoScale:300});Object.assign(j.document.people[0],{firstLine:'ALEX',photo:asset.id});j.document.people.push({...structuredClone(j.document.people[0]),id:crypto.randomUUID(),firstLine:'JAMIE'});
 const selected=await store.preview(j.id,j.document,{personIndex:1});
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),worker=new pdfjs.PDFWorker({verbosity:0});await worker.promise;
 try{
  for(let i=0;i<2;i++){
   const task=pdfjs.getDocument({data:new Uint8Array(selected),worker,isEvalSupported:false,verbosity:0});
   try{const pdf=await task.promise;assert.equal(pdf.numPages,2);const page=await pdf.getPage(1);assert.deepEqual(page.view,[0,0,153,243]);const text=(await page.getTextContent()).items.map(x=>x.str).join(' ');assert.match(text,/JAMIE/);assert.doesNotMatch(text,/ALEX/);const viewport=page.getViewport({scale:2.5}),surface=pdf.canvasFactory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));try{await page.render({canvas:null,canvasContext:surface.context,viewport}).promise;assert.ok(surface.canvas.toBuffer('image/png').length>1000);}finally{pdf.canvasFactory.destroy(surface);}}finally{await task.destroy();}
   assert.equal(worker.destroyed,false);
  }
  const full=await cardPdf(j.document,new Map([[asset.id,{normalized:source,width:900,height:1200}]]));const dictionaries=b=>[...b.toString('latin1').matchAll(/\/Subtype \/Image([\s\S]*?)>>/g)].map(m=>[Number(m[1].match(/\/Width (\d+)/)?.[1]),Number(m[1].match(/\/Height (\d+)/)?.[1])]);assert.ok(dictionaries(full).some(([w,h])=>w===900&&h===1200));assert.ok(dictionaries(selected).some(([w,h])=>w===675&&h===900));
 }finally{worker.destroy();db.close();}
});
