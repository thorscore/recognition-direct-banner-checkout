import test from 'node:test';import assert from 'node:assert/strict';
import {previewOffset,installPreviewFollow,mirrorCropPreview} from './public/preview-follow.mjs';

test('The phone crop preview reuses the finished front artwork at the correct aspect ratio',()=>{
 const copies=[],canvas={getContext:()=>({drawImage:(...args)=>copies.push(args)})},panel={hidden:true},note={};
 for(const [width,height]of [[608,383],[383,608]]){const source={width,height};mirrorCropPreview(source,canvas,panel,note);assert.equal(canvas.width,width);assert.equal(canvas.height,height);assert.equal(copies.at(-1)[0],source);assert.equal(panel.hidden,false);assert.match(note.textContent,/sliders/);}
 mirrorCropPreview(null,canvas,panel,note);assert.equal(panel.hidden,true);assert.equal(copies.length,2);
});

test('The preview follows the storefront viewport down to photo crops and stays inside the form',()=>{
 const bounds={layoutTop:300,layoutHeight:2800,previewHeight:620,width:1100};
 assert.equal(previewOffset({...bounds,visibleTop:0}),0);
 assert.equal(previewOffset({...bounds,visibleTop:1700}),1414);
 assert.equal(previewOffset({...bounds,visibleTop:10000}),2158);
 assert.equal(previewOffset({...bounds,visibleTop:1700,width:390}),0);
 assert.equal(previewOffset({...bounds,visibleTop:NaN}),0);
});

test('Viewport messages accept only the actual storefront parent and batch movement without network or redraws',()=>{
 const events={},frames=[],writes=[],classes=[];let observed=0;
 const layout={getBoundingClientRect:()=>({top:300}),offsetHeight:2800},preview={offsetHeight:620,style:{setProperty:(...args)=>writes.push(args)}};
 const parent={},window={parent,innerWidth:1100,scrollY:0,addEventListener:(name,fn)=>events[name]=fn,requestAnimationFrame:fn=>frames.push(fn)};
 const document={body:{classList:{add:name=>classes.push(name)}},getElementById:id=>id==='badgeLayout'?layout:preview};
 installPreviewFollow({window,document,ResizeObserver:class{observe(){observed++;}}});
 const event={source:parent,origin:'https://recognition-direct.com',data:{type:'rd-photo-id-viewport',top:1700,height:800}};
 for(const wrong of [{...event,source:{}},{...event,origin:'https://evil.example'},{...event,data:{...event.data,top:Infinity}}])events.message(wrong);
 assert.equal(frames.length,0);assert.equal(writes.length,0);
 events.message(event);events.message({...event,data:{...event.data,top:1800}});assert.equal(frames.length,1);frames.shift()();
 assert.deepEqual(writes.at(-1),['--preview-offset','1514px']);assert.ok(classes.includes('preview-follow-embedded'));assert.equal(observed,2);
 window.innerWidth=390;events.resize();frames.shift()();assert.deepEqual(writes.at(-1),['--preview-offset','0px']);
});
