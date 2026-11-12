import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {normalizeArtwork,MAX_ARTWORK_BYTES,MAX_PHOTO_PIXELS} from './artwork.mjs';
import {createPilotStore} from './store.mjs';
import {cardPdf} from './pdf.mjs';

// Synthetic camera-sized fixture. No customer photos or file paths are used.
const large=sharp({create:{width:3213,height:5712,channels:3,background:'#4b7196'}}).withMetadata({orientation:6}).jpeg({quality:92}).toBuffer();
const options=bytes=>({bytes,role:'portrait',type:'image/jpeg',filename:'camera-photo.jpeg'});

test('Large camera photos create a small display image while retaining full oriented production dimensions and private originals',async()=>{
 const bytes=await large,db=new DatabaseSync(':memory:'),store=createPilotStore({db,base:'https://example.test',shopify:{configured:false},send:async()=>{throw Error('No email expected');}}),job=store.create();
 const asset=await store.upload(job.id,options(bytes));assert.equal(asset.largePhoto,true);assert.equal(asset.width,5712);assert.equal(asset.height,3213);assert.deepEqual(store.original(asset.id).bytes,bytes);
 const row=db.prepare('SELECT * FROM photo_pilot_assets WHERE id=?').get(asset.id),production=await sharp(row.normalized).metadata(),preview=await sharp(store.image(asset.id)).metadata();
 assert.equal(production.format,'jpeg');assert.equal(production.width,5712);assert.equal(production.height,3213);assert.equal(production.orientation,undefined);assert.equal(production.exif,undefined);assert.equal(production.icc,undefined);
 assert.ok(preview.width<=900&&preview.height<=900);assert.equal(preview.format,'png');assert.ok(Math.abs(preview.width/preview.height-5712/3213)<.003);
 Object.assign(job.document.people[0],{firstLine:'SAMPLE',photo:asset.id});const saved=store.save(job.id,{expectedRevision:1,document:job.document}),before=JSON.stringify(saved);
 const display=await store.preview(job.id,job.document,{personIndex:0});const print=await cardPdf(job.document,new Map([[asset.id,{normalized:Buffer.from(row.normalized),width:row.width,height:row.height}]]));
 const images=b=>[...b.toString('latin1').matchAll(/\/Subtype \/Image([\s\S]*?)>>/g)].map(m=>[Number(m[1].match(/\/Width (\d+)/)?.[1]),Number(m[1].match(/\/Height (\d+)/)?.[1])]);
 assert.ok(images(display).some(([w,h])=>w===900&&h===506));assert.ok(images(print).some(([w,h])=>w===5712&&h===3213));assert.equal(JSON.stringify(store.read(job.id)),before);assert.deepEqual(store.original(asset.id).bytes,bytes);db.close();
});

test('Empty, oversized, corrupt and excessive-pixel photos return specific actionable errors',async()=>{
 await assert.rejects(()=>normalizeArtwork(options(Buffer.alloc(0))),e=>e.code==='ARTWORK_FILE_EMPTY');
 await assert.rejects(()=>normalizeArtwork(options(Buffer.alloc(MAX_ARTWORK_BYTES+1))),e=>e.code==='ARTWORK_FILE_TOO_LARGE'&&e.status===413);
 await assert.rejects(()=>normalizeArtwork(options(Buffer.from('ffd8ff00000000','hex'))),e=>e.code==='PHOTO_COULD_NOT_BE_READ');
 const tiny=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).jpeg({progressive:false}).toBuffer(),oversized=Buffer.from(tiny),frame=oversized.findIndex((v,i)=>v===255&&oversized[i+1]===192);assert.ok(frame>0);oversized.writeUInt16BE(10000,frame+5);oversized.writeUInt16BE(10000,frame+7);assert.ok(10000*10000>MAX_PHOTO_PIXELS);
 await assert.rejects(()=>normalizeArtwork(options(oversized)),e=>e.code==='PHOTO_TOO_MANY_PIXELS');
});

test('Only one large photo is processed at a time, and processing capacity is released afterward',async()=>{
 const bytes=await large,results=await Promise.allSettled([normalizeArtwork(options(bytes)),normalizeArtwork(options(bytes))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'PHOTO_PROCESSING_BUSY');
 assert.equal((await normalizeArtwork(options(bytes))).largePhoto,true);
});

test('Existing smaller photos and transparent artwork keep their prior format and dimensions',async()=>{
 const jpg=await sharp({create:{width:1200,height:1600,channels:3,background:'#6789ab'}}).jpeg().toBuffer(),small=await normalizeArtwork(options(jpg));assert.equal(small.largePhoto,false);const m=await sharp(small.normalized).metadata();assert.equal(m.format,'png');assert.equal(m.width,1200);assert.equal(m.height,1600);
 const png=await sharp({create:{width:40,height:60,channels:4,background:{r:30,g:60,b:90,alpha:.5}}}).png().toBuffer(),transparent=await normalizeArtwork({bytes:png,type:'image/png',role:'logo',filename:'mark.png'});assert.equal((await sharp(transparent.normalized).metadata()).hasAlpha,true);
});
