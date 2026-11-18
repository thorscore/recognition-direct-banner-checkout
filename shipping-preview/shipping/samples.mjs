import {randomUUID} from 'node:crypto';
import {DESTINATIONS} from './checkout-shipping.mjs';
const pickup='Pickup at 8680 Troy St., Spring Valley, CA 91977';
function item(handle,title,width,height,quantity=1,unit='10.00',extra={}){
  const id=randomUUID(),delivery=extra.delivery??'ship';
  return {id,orderId:'preview-'+id,summary:{title,quantity,subtotal:Number(unit)*quantity},draftInput:{
    email:'sample@example.com',note:'Fictional private-preview artwork. PDF proof approval required before production.',
    tags:['catalog-configuration',handle,delivery,'proof-required'],allowDiscountCodesInCheckout:true,
    shippingLine:{title:'Legacy preset shipping',priceWithCurrency:{amount:'39.95',currencyCode:'USD'}},
    shippingAddress:{...DESTINATIONS.troy,company:'Recognition Direct'},
    customAttributes:[{key:'Proof required',value:'Yes'}],
    lineItems:[{title,quantity,requiresShipping:true,taxable:true,originalUnitPriceWithCurrency:{amount:unit,currencyCode:'USD'},
      ...(extra.variantId?{variantId:extra.variantId}:{}),
      customAttributes:[{key:'Product Size',value:`${width} in x ${height} in`},{key:'Delivery Method',value:delivery==='ship'?'Ship':pickup},
        ...(handle==='coroplast'?[{key:'Material',value:'4mm White Coroplast'}]:handle==='foamcore'?[{key:'Material',value:'3/16" White Foamcore'}]:handle==='styrene'?[{key:'Material',value:'.020" white polystyrene film'}]:[]),
        {key:'Artwork reference',value:'FICTIONAL-SAMPLE-'+id.slice(0,8)},{key:'Proof approval',value:'Required before production'},
        {key:'Shipping Handling Rate',value:'Old preset to replace'}]}]
  }};
}
export const SAMPLES=[
  {id:'normal-coroplast',name:'Normal coroplast sign',to:'troy',items:()=>[item('coroplast','Coroplast sign · 24 × 18 in',24,18,1,'18.00')]},
  {id:'normal-banner',name:'Normal 5 × 3 ft banner',to:'troy',items:()=>[item('13oz-vinyl-banner','13 oz banner · 5 × 3 ft',60,36,1,'37.50')]},
  {id:'mixed-coroplast-banner',name:'Mixed cart: sign + banner',to:'troy',items:()=>[item('coroplast','Coroplast sign · 24 × 18 in',24,18,1,'18.00'),item('13oz-vinyl-banner','13 oz banner · 5 × 3 ft',60,36,1,'37.50')]},
  {id:'ten-artworks',name:'Ten artwork files in one sign carton',to:'troy',items:()=>Array.from({length:10},(_,i)=>item('coroplast',`Coroplast artwork ${i+1} · 18 × 28 in`,18,28,1,'18.00'))},
  {id:'thirteen-signs',name:'13 signs: second-carton boundary',to:'northcarolina',items:()=>[item('coroplast','Coroplast signs · 18 × 28 in',18,28,13,'18.00')]},
  {id:'foam-group',name:'Foam board: 1 + 2 copies',to:'newyork',items:()=>[item('foamcore','Foam board artwork A · 26.5 × 48 in',26.5,48,1,'30.00'),item('foamcore','Foam board artwork B · 26.5 × 48 in',26.5,48,2,'30.00')]},
  {id:'native-mixed-seattle',name:'Parking sign + plate · Seattle',to:'seattle',items:()=>[item('native-parking','Reserved parking sign',12,18,1,'75.00',{variantId:'gid://shopify/ProductVariant/67904924352808'}),item('native-parking','Magnetic name plate',12,3,1,'25.00',{variantId:'gid://shopify/ProductVariant/67904924385576'})]},
  {id:'native-mixed-pa',name:'Parking sign + plate · Pennsylvania',to:'philadelphia',items:()=>[item('native-parking','Reserved parking sign',12,18,1,'75.00',{variantId:'gid://shopify/ProductVariant/67904924352808'}),item('native-parking','Magnetic name plate',12,3,1,'25.00',{variantId:'gid://shopify/ProductVariant/67904924385576'})]},
  {id:'mixed-unsupported',name:'Mixed cart: sign + 60 × 48 in window perf',to:'houston',items:()=>[item('coroplast','Coroplast sign · 24 × 18 in',24,18,1,'18.00'),item('adhesive-window-perf','Window perf · 60 × 48 in',60,48,1,'90.00')]},
  {id:'rigid-oversize',name:'Exception: sign over 48 × 36 in',to:'troy',items:()=>[item('coroplast','Oversized coroplast · 60 × 24 in',60,24,1,'45.00')]},
  {id:'troy-pickup',name:'Troy Street pickup',to:'troy',items:()=>[item('coroplast','Coroplast pickup · 24 × 18 in',24,18,1,'18.00',{delivery:'pickup-spring-valley'})]},
  {id:'large-canvas',name:'Large canvas: 52 × 78 in + two 60 × 40 in',to:'americanfork',items:()=>[item('canvas-roll','Canvas roll · 52 × 78 in',52,78,1,'90.00'),item('canvas-roll','Canvas roll · 60 × 40 in',60,40,2,'60.00')]},
  {id:'wide-window-perf',name:'Window perf: 60 × 48 in',to:'houston',items:()=>[item('adhesive-window-perf','Window perf · 60 × 48 in',60,48,1,'90.00')]},
  {id:'mixed-outside-roll',name:'Exception: sign + roll beyond supported width',to:'houston',items:()=>[item('coroplast','Coroplast sign · 24 × 18 in',24,18,1,'18.00'),item('adhesive-window-perf','Window perf · 84 × 120 in',84,120,1,'180.00')]},
  {id:'name-badges-small',name:'In-house: two name badges',to:'seattle',items:()=>[item('name-badges','Name badges · 3 × 1 in',3,1,2,'10.25')]},
  {id:'photo-id-small',name:'In-house: ten Photo ID badges',to:'dallas',items:()=>[item('photo-id-badges','Photo ID badges · 3.375 × 2.125 in',3.375,2.125,10,'12.50')]},
  {id:'solar-placard-small',name:'In-house: 8 × 6 in solar placard',to:'seattle',items:()=>[item('solar-placards','Solar placard · 8 × 6 in',8,6,1,'15.00')]},
  {id:'compact-mixed',name:'In-house mixed: badges + Photo ID + placard',to:'northcarolina',items:()=>[item('name-badges','Name badges · 3 × 1 in',3,1,2,'10.25'),item('photo-id-badges','Photo ID badges · 3.375 × 2.125 in',3.375,2.125,2,'12.50'),item('solar-placards','Solar placard · 8 × 6 in',8,6,1,'15.00')]},
  {id:'styrene-bulk',name:'Bulk styrene: 116 thin 35.75 × 9 in strips',to:'seattle',items:()=>[item('styrene','Styrene strip · 35.75 × 9 in',35.75,9,116,'8.00')]}
];
export function sampleCart(sample,id=randomUUID()){
  return {id,version:1,status:'open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),items:sample.items()};
}
