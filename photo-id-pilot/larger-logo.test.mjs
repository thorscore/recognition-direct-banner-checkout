import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument,checkDocument,financialSignature} from './document.mjs';
import {DESIGN_OPTIONS,layoutFor} from './shared/layout.mjs';
import {logoPosition,mountingGeometry} from './shared/slot-geometry.mjs';
import {cardPdf,proofPdf} from './pdf.mjs';
import {samplePortrait} from './fixtures.mjs';
import {createCanvas} from '@napi-rs/canvas';

const intersect=(a,b)=>a.x<b.x+b.width-.001&&a.x+a.width>b.x+.001&&a.y<b.y+b.height-.001&&a.y+a.height>b.y+.001;
const doc=()=>{const d=newDocument();Object.assign(d,{logo:'b'.repeat(32),organization:'SAMPLE COMPANY',attachment:'lanyard',punch:'punch',backText:'If found, please return to Sample Company.'});Object.assign(d.people[0],{firstLine:'JAMIE',secondLine:'RIVERA',photo:'a'.repeat(32)});return d;};

test('Larger logos grow in every layout without touching names, portraits, the card edges or slot',()=>{
 for(const choice of DESIGN_OPTIONS)for(const orientation of ['landscape','portrait'])for(const punched of [false,true]){
  const d=doc();Object.assign(d,{layout:choice.id,orientation,attachment:punched?'lanyard':'none',punch:punched?'punch':'unpunched'});
  let previous=0;
  for(const logoScale of [25,100,150,151,175,200,250,300]){
   d.logoScale=logoScale;assert.doesNotThrow(()=>checkDocument(d,{complete:true}));
   const f=layoutFor(d),g=f.geometry,mount=mountingGeometry(d.attachment,d.punch,d);
   if(orientation==='landscape'&&f.organizationOnColor)assert.ok(f.second.y+f.second.max*.17<486,'Name stays above the colored company band');
   for(const [width,height]of [[600,600],[1200,180],[300,900],[4000,40]]){
    const logo=logoPosition(width,height,logoScale,punched,d),description=`${choice.id} ${orientation} ${logoScale} ${width}/${height}`;
    assert.ok(logo.x>=0&&logo.y>=0&&logo.x+logo.width<=g.width+.001&&logo.y+logo.height<=g.height+.001,description);
    assert.equal(intersect(logo,{x:f.photo.x,y:f.photo.y,width:f.photo.w,height:f.photo.h}),false,description+' photo');
    for(const key of ['first','second','organization']){const t=f[key];assert.equal(intersect(logo,{x:t.x,y:t.y-t.max*.83,width:t.width,height:t.max}),false,description+' '+key);}
    if(logoScale>150){assert.equal(intersect(logo,f.rule),false,description+' decorative rule');if(f.id==='framed-id.v1')assert.ok(logo.y+logo.height<f.dividerY,description+' frame divider');}
    if(mount.slot){const s=mount.slot;assert.equal(intersect(logo,{x:s.x*288,y:s.y*288,width:s.width*288,height:s.height*288}),false,description+' slot');}
   }
   const square=logoPosition(600,600,logoScale,punched,d);assert.ok(square.height>=previous-.001);previous=square.height;
  }
  d.logoScale=150;const old=logoPosition(600,600,150,punched,d);d.logoScale=300;const large=logoPosition(600,600,300,punched,d);assert.ok(large.height>=old.height*2,choice.id+' '+orientation+' grows at least twice as tall');
 }
});

test('Existing logo sizes retain their layout and the larger range changes no financial options',()=>{
 for(const choice of DESIGN_OPTIONS)for(const orientation of ['landscape','portrait']){
  const d=doc();Object.assign(d,{layout:choice.id,orientation});const original=financialSignature(d);d.logoScale=150;const old=layoutFor(d);d.logoScale=100;assert.deepEqual(layoutFor(d),old);d.logoScale=300;assert.equal(financialSignature(d),original);assert.equal(checkDocument(d).price.unitCents,1450);
  d.logo=null;assert.deepEqual(layoutFor(d),old);
 }
 for(const value of [24,301,NaN,Infinity,'300']){const d=doc();d.logoScale=value;assert.throws(()=>checkDocument(d),e=>e.code==='BADGE_DETAILS_INVALID');}
});

test('Large-logo artwork and proofs render at the selected trim for all ten designs',async()=>{
 const canvas=createCanvas(600,600),ctx=canvas.getContext('2d');ctx.fillStyle='#003cce';ctx.fillRect(0,0,600,600);ctx.fillStyle='white';ctx.font='bold 180px Arial';ctx.fillText('LOGO',30,350);
 const assets=new Map([['a'.repeat(32),{normalized:await samplePortrait(),width:900,height:1200}],['b'.repeat(32),{normalized:canvas.toBuffer('image/png'),width:600,height:600}]]);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 for(const choice of DESIGN_OPTIONS)for(const orientation of ['landscape','portrait']){
  const d=doc();Object.assign(d,{layout:choice.id,orientation,logoScale:300,printSides:'front-and-back'});
  const pdf=await cardPdf(d,assets),f=layoutFor(d);const media=[...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)];assert.equal(media.length,2);for(const page of media)assert.deepEqual(page[1].trim().split(/\s+/).map(Number),[0,0,f.geometry.trimWidth,f.geometry.trimHeight]);
  const proof=await proofPdf(d,assets,{id:'LARGE-LOGO-SAMPLE',revision:2,subtotalCents:1750}),task=pdfjs.getDocument({data:new Uint8Array(proof),isEvalSupported:false,verbosity:0});try{const p=await task.promise;let text='';for(let n=1;n<=p.numPages;n++)text+=' '+(await(await p.getPage(n)).getTextContent()).items.map(x=>x.str).join(' ');assert.ok(text.includes('300% size'));assert.ok(text.includes('JAMIE'));assert.ok(text.includes('RIVERA'));assert.ok(text.includes(choice.label));}finally{await task.destroy();}
 }
});
