// Native canvas geometry, measured against the owner-selected, inspected reference.
// This is editable layout code, never a raster background containing sample identities.
export const LAYOUT_ID='teal-cobalt-geometric.v1';
export const normalizeLayout=value=>{if(value===undefined)return LAYOUT_ID;if(value!==LAYOUT_ID)throw Error('BADGE_LAYOUT_INVALID');return value;};
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
export function drawFrontFrame(ctx,palette){
  ctx.save();ctx.beginPath();ctx.roundRect(0,0,972,612,36);ctx.clip();
  for(const shape of CORNER_SHAPES){ctx.fillStyle=palette[shape.color];ctx.beginPath();shape.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  ctx.restore();
}
