import test from 'node:test';import assert from 'node:assert/strict';
import {newDocument,checkDocument} from './document.mjs';
import {cardPdf} from './pdf.mjs';
import {previewSnapshot} from '../photo-id/public/preview-queue.mjs';

async function backItems(document){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const bytes=await cardPdf(document,new Map()),task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,verbosity:0});try{const pdf=await task.promise;return (await(await pdf.getPage(2)).getTextContent()).items;}finally{await task.destroy();}}
const fixture=()=>{const d=newDocument();d.organization='Sample Company';d.printSides='front-and-back';d.backText='If found, please return this badge to reception. Thank you.';return d;};

test('A custom back heading replaces the placeholder and the body uses a readable, smaller font',async()=>{
 for(const orientation of ['landscape','portrait']){const d=fixture();Object.assign(d,{orientation,backHeading:'Return instructions'});const items=await backItems(d),text=items.map(i=>i.str).join(' ');assert.match(text,/Return instructions/);assert.doesNotMatch(text,/YOUR MESSAGE/);const heading=items.find(i=>i.str.includes('Return instructions')),body=items.find(i=>i.str.includes('If found'));assert.ok(Math.abs(body.transform[0])>=10);assert.ok(Math.abs(heading.transform[0])>Math.abs(body.transform[0]));}
});
test('A blank back heading prints only the customer message in the larger available area',async()=>{
 for(const orientation of ['landscape','portrait']){const d=fixture();d.orientation=orientation;const items=await backItems(d),text=items.map(i=>i.str).join(' ');assert.doesNotMatch(text,/YOUR MESSAGE/);assert.match(text,/If found/);assert.ok(Math.abs(items.find(i=>i.str.includes('If found')).transform[0])>=11);}
});
test('Legacy documents retain their exact layout and hashes until the back is edited',async()=>{
 const d=fixture();delete d.backHeading;const serialized=JSON.stringify(d);assert.equal(JSON.stringify(checkDocument(d).document),serialized);assert.match((await backItems(d)).map(i=>i.str).join(' '),/YOUR MESSAGE/);
 const job={id:'sample',document:d},oldKey=previewSnapshot(job,0).key;d.backHeading='';assert.notEqual(previewSnapshot(job,0).key,oldKey);assert.equal(checkDocument(d).price.unitCents,1550);
 for(const value of [null,12,'x'.repeat(161),'bad\nheading']){d.backHeading=value;assert.throws(()=>checkDocument(d),e=>e.code==='BADGE_DETAILS_INVALID');}
});
test('Long back text fits down within its safe area or returns a clear error instead of clipping',async()=>{
 const d=fixture();d.backHeading='Return instructions';d.backText='Please return this badge to the office. '.repeat(8);await backItems(d);d.backText='word '.repeat(400);await assert.rejects(()=>backItems(d),e=>e.code==='BACK_TEXT_DOES_NOT_FIT');
});
