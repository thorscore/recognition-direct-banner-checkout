import {FIXED_SIZES,STANDARD_COLORS,DUETS_COLORS,TIERS,FAMILIES,CATALOG_VERSION,CORNER_RADII,TEXT_SIZE} from './catalog.mjs';
export const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const reject=code=>{throw Error(code);};
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)?value:reject('TEXT_INVALID');
export function validateSize(size){
 if(!size||!/^[a-zA-Z0-9-]{1,40}$/.test(size.id)||![size.width,size.height].every(n=>Number.isFinite(n)&&n>0)||size.width*size.height>12||!['standard','larger'].includes(size.band))reject('FIXED_SIZE_INVALID');
 const normalStandard=size.width<=3&&size.height<=1.5,normalLarger=size.width>=3&&size.height>=1.5&&(size.width>3||size.height>1.5);
 const smallOverride=size.id==='2-75x1-625'&&size.width===2.75&&size.height===1.625&&size.standardPriceOverride===true&&size.classificationAuthority==='owner-fixed-size-2026-11-06';
 if(size.band==='standard'&&!normalStandard&&!smallOverride||size.band==='larger'&&!normalLarger&&size.aspectConfirmed!==true)reject('SIZE_CLASSIFICATION_REQUIRES_OWNER');
 return size;
}
export function normalizeDraft(input,{sizes=FIXED_SIZES,duetsColors=DUETS_COLORS}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['family','size','stockColor','frame','fastener','dome','quantity','expressOne','organization','people','notes','delivery','textColor','layout','textAlignment','cornerRadius','textSize'].includes(k)))reject('UNEXPECTED_FIELDS');
 if(typeof input.family!=='string'||!Object.hasOwn(FAMILIES,input.family))reject('BADGE_FAMILY_REQUIRED');
 const family=FAMILIES[input.family];
 const size=sizes.find(s=>s.id===input.size);if(!size)reject('OFFERED_FIXED_SIZE_REQUIRED');validateSize(size);
 if(!['none','silver','gold'].includes(input.frame)||!['pin','magnetic'].includes(input.fastener)||typeof input.dome!=='boolean'||typeof input.expressOne!=='boolean')reject('OPTION_INVALID');
 if(input.frame!=='none'&&(input.family==='duets'||size.band==='larger'||size.frameEligibility==='unavailable'))reject('FRAME_NOT_AVAILABLE');
 if(input.frame!=='none'&&size.frameEligibility==='pending')reject('FRAME_COMPATIBILITY_PENDING');
 if (Object.hasOwn(input, 'cornerRadius')) {
  if (input.frame !== 'none') reject('CORNER_RADIUS_REQUIRES_FRAMELESS');
  if (!CORNER_RADII.some(radius => radius.id === input.cornerRadius)) reject('CORNER_RADIUS_INVALID');
 }
 const colors=input.family==='standard'?STANDARD_COLORS:duetsColors;
 if(input.family==='standard'&&!colors.some(c=>c.id===input.stockColor)||input.family==='duets'&&(colors.length?!colors.some(c=>c.id===input.stockColor):input.stockColor!=='pending'))reject('STOCK_COLOR_REQUIRED');
 if(!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>10000)reject('QUANTITY_INVALID');
 if(!Array.isArray(input.people)||input.people.length<1||input.people.length>100)reject('ROSTER_INVALID');
 const people=input.people.map(p=>{if(!p||Object.keys(p).some(k=>!['name','title','copies'].includes(k))||!Number.isSafeInteger(p.copies)||p.copies<1||p.copies>10000)reject('PERSON_INVALID');return {name:text(p.name,100),title:Object.hasOwn(p,'title')?text(p.title,100):'',copies:p.copies};});
 const named=people.reduce((n,p)=>n+p.copies,0);if(named>input.quantity||!input.expressOne&&named!==input.quantity)reject('ROSTER_QUANTITY_MISMATCH');
 if(!['ship','troy'].includes(input.delivery)||!['logo-left','logo-top'].includes(input.layout)||!/^#[a-fA-F0-9]{6}$/.test(input.textColor))reject('LAYOUT_OR_DELIVERY_INVALID');
 if(input.family==='standard'&&input.textColor.toLowerCase()!=='#111111')reject('ENGRAVED_TEXT_COLOR_FIXED');
 const textAlignment=Object.hasOwn(input,'textAlignment')?input.textAlignment:'left';
 if(!['left','center'].includes(textAlignment))reject('TEXT_ALIGNMENT_INVALID');
 if (Object.hasOwn(input, 'textSize') && (!Number.isInteger(input.textSize) ||
     input.textSize < TEXT_SIZE.min || input.textSize > TEXT_SIZE.max ||
     (input.textSize - TEXT_SIZE.min) % TEXT_SIZE.step !== 0)) reject('TEXT_SIZE_INVALID');
 return {schema:CATALOG_VERSION,...input,textAlignment,organization:Object.hasOwn(input,'organization')?text(input.organization,100):'',notes:text(input.notes,2000),people,material:family.substrate,glossClearCoatIncluded:family.glossIncluded,namedQuantity:named,heldForLater:input.expressOne?input.quantity-named:0};
}
export function priceDraft(input,config){
 const d=normalizeDraft(input,config);
 if(d.quantity>=1500)return {mode:'quote',unitCents:null,totalCents:null,reasons:['Quantities of 1500 or more are by quote.']};
 const tier=TIERS.findLast(t=>d.quantity>=t.min),size=(config?.sizes??FIXED_SIZES).find(s=>s.id===d.size);
 const base=d.frame==='none'?tier.unframed:tier.framed,larger=size.band==='larger'?100:0,magnet=d.fastener==='magnetic'?tier.magnet:0,dome=d.dome?tier.dome:0,unitCents=base+larger+magnet+dome;
 return {mode:'estimated',unitCents,totalCents:unitCents*d.quantity,components:{base,larger,magnet,dome},taxAndDeliveryIncluded:false};
}
// A review preview is never a checkout authorizer, even when an estimate is known.
export function readiness(input,config){const d=normalizeDraft(input,config),price=priceDraft(draftInput(d),config),size=(config?.sizes??FIXED_SIZES).find(s=>s.id===d.size);return {localReviewReady:true,checkoutEnabled:false,productionEnabled:false,price,missingDecisions:d.family==='standard'&&size.frameEligibility==='pending'?['New small-size frame compatibility']:[],internalManufacturingSkuVerified:false};}
export function draftInput(d) {
  const fields = ['family','size','stockColor','frame','fastener','dome','quantity','expressOne','organization','people','notes','delivery','textColor','layout'];
  // Omitting the default keeps earlier snapshots and retry fingerprints valid.
  if (Object.hasOwn(d, 'textAlignment') && d.textAlignment !== 'left') fields.push('textAlignment');
  if (Object.hasOwn(d, 'textSize') && d.textSize !== TEXT_SIZE.default) fields.push('textSize');
  // Older orders did not record a corner choice. Keep their snapshots intact.
  if (Object.hasOwn(d, 'cornerRadius')) fields.push('cornerRadius');
  return Object.fromEntries(fields.map(k => [k, d[k]]));
}
export function initialDraft(family='standard'){return {family,size:'1x3',stockColor:'white',frame:'none',fastener:'magnetic',dome:false,quantity:1,expressOne:false,organization:'Your company',people:[{name:'Alex Taylor',title:'Office Manager',copies:1}],notes:'',delivery:'ship',textColor:'#111111',layout:'logo-left'};}
