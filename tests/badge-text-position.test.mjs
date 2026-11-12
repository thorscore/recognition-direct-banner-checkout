import assert from 'node:assert/strict';
import {test} from 'node:test';
import {badgeTextLayout,fitBadgeText,fitText} from '../public/badge-preview/layout.js';
import {productionPlan} from '../public/badge-preview/render.js';
import {initialDraft,normalizeDraft,draftInput,priceDraft} from '../badge-designer/model.mjs';
import {FIXED_SIZES} from '../badge-designer/catalog.mjs';
const measure=(value,size)=>({width:value.length*size*.52,actualBoundingBoxAscent:size*.65,actualBoundingBoxDescent:size*.15});
function draft(family='standard',overrides={}){return {...initialDraft(family),organization:'',people:[{name:'James Thomas',title:'Manager',copies:1}],textAlignment:'center',size:'3-5x2-25',layout:'logo-top',...overrides};}

test('legacy snapshots and zero-position layout retain the previous geometry and price',()=>{
 const d=draft();const legacy=draftInput(normalizeDraft(d));
 assert.deepEqual(draftInput(normalizeDraft({...d,textVerticalPosition:0})),legacy);
 const layout=badgeTextLayout(1050,675,'logo-top',{hasLogo:true,alignment:'center',...d.people[0],organization:''});
 const old=layout.lines.map(line=>({...line,...fitText(measure,line.value,{width:layout.clip.width,above:line.above,below:line.below},line.max,line.min)}));
 assert.deepEqual(fitBadgeText(layout,measure),old);
 assert.deepEqual(priceDraft({...d,textVerticalPosition:85}),priceDraft(d));
});

test('one to three lines move as a group without resizing or moving the logo for both styles and every size',()=>{
 for(const family of ['standard','duets'])for(const size of FIXED_SIZES)for(const count of [1,2,3])for(const logoLayout of ['logo-top','logo-left'])for(const hasLogo of [true,false]){
  const d=draft(family,{size:size.id,layout:logoLayout,organization:count===3?'Sample office':'',people:[{name:'Alex',title:count>=2?'Manager':'',copies:1}]});
  const logo=hasLogo?{width:300,height:200}:null;
  const base=productionPlan({design:d,logoScale:1},0,logo,measure);
  for(const offset of [-100,-55,55,100]){
   const moved=productionPlan({design:{...d,textVerticalPosition:offset},logoScale:1},0,logo,measure);
   const delta=moved.lines[0].y-base.lines[0].y;
   assert.ok(offset<0?delta<=0:delta>=0);
   assert.deepEqual(moved.logoRect,base.logoRect);
   moved.lines.forEach((line,i)=>{
    assert.equal(line.size,base.lines[i].size);
    assert.ok(Math.abs(line.y-base.lines[i].y-delta)<1e-8);
    if(line.fits){const m=measure(line.value,line.size);assert.ok(line.y-m.actualBoundingBoxAscent>=moved.clip.y-1e-8);assert.ok(line.y+m.actualBoundingBoxDescent<=moved.clip.y+moved.clip.height+1e-8);}
   });
  }
 }
});

test('position is validated and retained in checkout/production snapshots',()=>{
 for(const family of ['standard','duets']){
  const input={...draft(family),textVerticalPosition:64};
  assert.equal(draftInput(normalizeDraft(input)).textVerticalPosition,64);
 }
 for(const value of [-101,101,1.5,'30',null,NaN,Infinity])assert.throws(()=>normalizeDraft({...draft(),textVerticalPosition:value}),/TEXT_POSITION_INVALID/);
});
