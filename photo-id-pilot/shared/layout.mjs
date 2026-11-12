// Native canvas geometry, measured against the owner-selected, inspected reference.
// This is editable layout code, never a raster background containing sample identities.
import {cardGeometry} from './card-geometry.mjs';
export const LAYOUT_ID='teal-cobalt-geometric.v1';
export const DESIGN_OPTIONS=Object.freeze([
 Object.freeze({id:LAYOUT_ID,label:'Corner accents'}),
 Object.freeze({id:'clean-header.v1',label:'Clean header'}),
 Object.freeze({id:'side-stripe.v1',label:'Side stripe'}),
 Object.freeze({id:'framed-id.v1',label:'Classic frame'}),
 Object.freeze({id:'soft-panel.v1',label:'Color panels'})
]);
export const normalizeLayout=value=>{if(value===undefined)return LAYOUT_ID;if(!DESIGN_OPTIONS.some(x=>x.id===value))throw Error('BADGE_LAYOUT_INVALID');return value;};
export const FRONT_LAYOUT=Object.freeze({
  portrait:Object.freeze({x:42,widthInches:1.16,heightInches:1.57}),
  logo:Object.freeze({x:433,y:40,width:500,height:90}),
  first:Object.freeze({x:403,y:239,width:530,max:103,min:32,weight:750}),
  second:Object.freeze({x:403,y:337,width:530,max:103,min:32,weight:750}),
  organization:Object.freeze({x:405,y:398,width:500,max:36,min:22,weight:450}),
  rule:Object.freeze({x:407,y:437,width:116,height:8}),
  ink:'#001333'
});
export const CORNER_SHAPES=Object.freeze([
  Object.freeze({color:'secondaryColor',points:Object.freeze([[0,0],[478,0],[0,326]])}),
  Object.freeze({color:'color',points:Object.freeze([[0,0],[326,0],[0,253]])}),
  Object.freeze({color:'color',points:Object.freeze([[660,612],[972,362],[972,612]])}),
  Object.freeze({color:'secondaryColor',points:Object.freeze([[660,612],[972,423],[972,612]])})
]);
const centered=(x,y,width,max=76,min=24)=>({x,y,width,max,min,align:'center'});
const landscape={
 [LAYOUT_ID]:{...FRONT_LAYOUT,photo:{x:42,y:(612-1.57*288)/2,w:1.16*288,h:1.57*288}},
 'clean-header.v1':{photo:{x:60,y:135,w:310,h:420},logo:{x:414,y:92,width:500,height:96},first:{x:414,y:300,width:500,max:88,min:28},second:{x:414,y:390,width:500,max:88,min:28},organization:{x:414,y:462,width:500,max:34,min:20},rule:{x:414,y:494,width:450,height:5},ink:'#001333'},
 'side-stripe.v1':{photo:{x:145,y:110,w:300,h:405},logo:{x:486,y:62,width:430,height:94},first:{x:486,y:285,width:430,max:88,min:28},second:{x:486,y:375,width:430,max:88,min:28},organization:{x:486,y:447,width:430,max:32,min:18},rule:{x:486,y:490,width:400,height:6},ink:'#001333'},
 'framed-id.v1':{photo:{x:60,y:120,w:300,h:405},logo:{x:410,y:62,width:490,height:90},first:{x:410,y:292,width:490,max:92,min:28},second:{x:410,y:386,width:490,max:92,min:28},organization:{x:410,y:460,width:490,max:34,min:20},rule:{x:410,y:494,width:420,height:5},ink:'#001333'},
 'soft-panel.v1':{photo:{x:60,y:92,w:310,h:420},logo:{x:414,y:70,width:500,height:100},first:{x:414,y:260,width:500,max:94,min:28},second:{x:414,y:354,width:500,max:94,min:28},organization:{x:414,y:532,width:500,max:34,min:20},rule:{x:414,y:397,width:116,height:7},ink:'#001333',organizationOnColor:true}
};
const portrait={
 [LAYOUT_ID]:{photo:{x:(612-1.16*288)/2,y:200,w:1.16*288,h:1.57*288},logo:{x:70,y:88,width:472,height:82},first:centered(50,738,512,80),second:centered(50,820,512,80),organization:centered(50,880,512,30,16),rule:{x:248,y:916,width:116,height:7},ink:'#001333'},
 'clean-header.v1':{photo:{x:149,y:230,w:314,h:425},logo:{x:90,y:108,width:432,height:86},first:centered(50,766,512,68),second:centered(50,837,512,68),organization:centered(50,902,512,30,16),rule:{x:126,y:933,width:360,height:5},ink:'#001333'},
 'side-stripe.v1':{photo:{x:174,y:228,w:300,h:406},logo:{x:110,y:105,width:440,height:90},first:centered(94,740,476,74),second:centered(94,817,476,74),organization:centered(94,877,476,28,16),rule:{x:116,y:916,width:430,height:6},ink:'#001333'},
 'framed-id.v1':{photo:{x:126,y:228,w:360,h:450},logo:{x:84,y:105,width:444,height:80},first:centered(66,760,480,70),second:centered(66,835,480,70),organization:centered(66,897,480,28,16),rule:{x:126,y:927,width:360,height:5},ink:'#001333'},
 'soft-panel.v1':{photo:{x:(612-1.16*288)/2,y:200,w:1.16*288,h:1.57*288},logo:{x:90,y:88,width:432,height:85},first:centered(50,755,512,76),second:centered(50,831,512,76),organization:centered(50,918,512,30,16),rule:{x:248,y:165,width:116,height:7},ink:'#001333',organizationOnColor:true}
};
export function layoutFor(document={}){
 const id=normalizeLayout(document.layout),geometry=cardGeometry(document);
 return {...(geometry.orientation==='portrait'?portrait:landscape)[id],id,label:DESIGN_OPTIONS.find(x=>x.id===id).label,geometry};
}
export function cornerShapesFor(document={}){
 if(cardGeometry(document).orientation==='landscape')return CORNER_SHAPES;
 return [
  {color:'secondaryColor',points:[[0,0],[330,0],[0,300]]},
  {color:'color',points:[[0,0],[220,0],[0,230]]},
  {color:'color',points:[[330,972],[612,730],[612,972]]},
  {color:'secondaryColor',points:[[330,972],[612,805],[612,972]]}
 ];
}
export function backLayoutFor(document={}){
 const geometry=cardGeometry(document);
 if(geometry.orientation==='landscape')return {geometry,header:{x:40,y:40,width:892,height:108,radius:18},organization:{x:90,y:112,width:790,max:40,min:22},title:{x:90,y:235,width:790,max:42,min:28},message:{x:90,y:285,width:790,bottom:530,size:32},rule:{x:90,y:540,width:790,height:5},custom:{x:60,y:180,width:852,withTextHeight:180,aloneHeight:350,textGap:35,bottom:560,textWithoutArtY:220}};
 return {geometry,header:{x:36,y:90,width:540,height:144,radius:18},organization:centered(62,177,488,34,18),title:centered(54,310,504,42,24),message:{x:54,y:365,width:504,bottom:820,size:32},rule:{x:54,y:870,width:504,height:6},custom:{x:54,y:280,width:504,withTextHeight:280,aloneHeight:520,textGap:35,bottom:870,textWithoutArtY:310}};
}
export function drawFrontFrame(ctx,palette){
  ctx.save();ctx.beginPath();ctx.roundRect(0,0,972,612,36);ctx.clip();
  for(const shape of CORNER_SHAPES){ctx.fillStyle=palette[shape.color];ctx.beginPath();shape.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  ctx.restore();
}
