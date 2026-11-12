import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const path=new URL('./public/storefront-embed.js',import.meta.url);
const source=fs.readFileSync(path,'utf8');
function fixture(hash=''){
 const messages=[],history=[],listeners={},frame={dataset:{rdPhotoUrl:'https://checkout.recognition-direct.com/photo-id/'},style:{},contentWindow:{postMessage:(...args)=>messages.push(args)}};
 const location={hash,pathname:'/pages/photo-id-badges',search:''};vm.runInNewContext(source,{URL,document:{querySelectorAll:()=>[frame]},location,history:{replaceState:(_s,_t,url)=>history.push(url)},window:{addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn)}});
 return {frame,messages,history,location,emit(name,event){for(const fn of listeners[name]??[])fn(event);}};
}
test('Public proof URLs load the private designer inside the storefront and retain its header',()=>{
 const hash='#proof='+'a'.repeat(32),f=fixture(hash);assert.equal(f.frame.src,'https://checkout.recognition-direct.com/photo-id/'+hash);f.location.hash='#job='+'b'.repeat(32);f.emit('hashchange');assert.equal(f.messages[0][0].hash,f.location.hash);assert.equal(f.location.pathname,'/pages/photo-id-badges');
 f.emit('message',{origin:'https://checkout.recognition-direct.com',source:f.frame.contentWindow,data:{type:'rd-photo-id-route',hash:'#job='+'c'.repeat(32)}});assert.equal(f.history[0],'/pages/photo-id-badges#job='+'c'.repeat(32));
});
test('Other windows and origins cannot navigate or resize the storefront designer',()=>{
 const f=fixture('#photo-id-designer'),data={type:'rd-photo-id-route',hash:'#job='+'d'.repeat(32)};assert.equal(f.frame.src,'https://checkout.recognition-direct.com/photo-id/');
 f.emit('message',{origin:'https://other.example',source:f.frame.contentWindow,data});f.emit('message',{origin:'https://checkout.recognition-direct.com',source:{},data});f.emit('message',{origin:'https://checkout.recognition-direct.com',source:f.frame.contentWindow,data:{...data,hash:'https://other.example'}});assert.equal(f.history.length,0);
 f.emit('message',{origin:'https://checkout.recognition-direct.com',source:f.frame.contentWindow,data:{type:'rd-photo-id-height',height:1000}});assert.equal(f.frame.style.height,'1004px');f.emit('message',{origin:'https://checkout.recognition-direct.com',source:f.frame.contentWindow,data:{type:'rd-photo-id-height',height:Infinity}});assert.equal(f.frame.style.height,'1004px');
});
