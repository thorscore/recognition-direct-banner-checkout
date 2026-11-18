// Local quote-validation engine. No network, credentials, draft/order writes or release switch.
// Physical family estimates are permitted; exact per-design measurements are not required.
import {destinationClass,DESTINATION_POLICY} from './destination-classes.mjs';
export const MARKUP_BPS = 0;
export const HANDLING_CENTS = 0;
export const RATE_ORIGIN = Object.freeze({id:'rd-troy',address1:'8680 Troy Street',city:'Spring Valley',provinceCode:'CA',zip:'91977',countryCode:'US'});
export const REGIONS = Object.freeze({
  west: ['CA','AZ','NV','OR','WA'],
  central: ['TX','OK','NM','CO','KS','NE','SD','ND','UT','ID','MT','WY'],
  east: ['AL','AR','CT','DE','DC','FL','GA','IA','IL','IN','KY','LA','MA','MD','ME','MI','MN','MO','MS','NC','NH','NJ','NY','OH','PA','RI','SC','TN','VA','VT','WI','WV']
});
const rigid = new Set(['coroplast','foamcore','aluminum-sign','gatorfoam','styrene','pvc-board','aluminum-sandwich-board','reflective-coroplast','reflective-aluminum-sandwich-board','dry-erase-coroplast','dry-erase-foamcore','dry-erase-pvc-board','dry-erase-aluminum-sandwich-board']);
const families = {
  coroplast: {kind:'panel', densityLbPerSqFt:0.20, capacity:12, allowedMaterial:/^4mm white coroplast$/i},
  foamcore: {kind:'panel', densityLbPerSqFt:0.16, capacity:6, allowedMaterial:/^3\/16["″]? white foamcore$/i},
  styrene: {kind:'styrene-strip',densityLbPerSqFt:0.11,capacity:120,requiresMaterial:true,allowedMaterial:/^0?\.020["″]? white polystyrene film$/i},
  'aluminum-sign': {kind:'panel', densityLbPerSqFt:0.65, capacity:6},
  '13oz-vinyl-banner': {kind:'roll', densityLbPerSqFt:0.10, capacity:10},
  'adhesive-window-perf': {kind:'roll', densityLbPerSqFt:0.12, capacity:5},
  'etched-printable-frosted-vinyl': {kind:'roll', densityLbPerSqFt:0.12, capacity:5},
  'canvas-roll': {kind:'roll', densityLbPerSqFt:0.15, capacity:5},
  'tension-fabric': {kind:'roll', densityLbPerSqFt:0.08, capacity:10},
  'dry-erase-magnet': {kind:'panel', densityLbPerSqFt:0.90, capacity:4}
};
const compact={
  'in-house/name-badges':{unitLb:0.15,maxUnits:25,maxLong:4,maxShort:3,defaultSize:[3,1]},
  'in-house/photo-id':{unitLb:0.25,maxUnits:10,maxLong:3.5,maxShort:2.25,defaultSize:[3.375,2.125]},
  'in-house/solar-placards':{unitLb:0.4,maxUnits:10,maxLong:10,maxShort:7}
};
const positive = x => typeof x==='number' && Number.isFinite(x) && x>0;
const int = x => Number.isSafeInteger(x) && x>0;
export const regionFor = state => Object.entries(REGIONS).find(([,a])=>a.includes(state))?.[0]??null;
export function parcelRisk({packageIn,packedWeightLb}, date='2026-11-17') {
  if(!Array.isArray(packageIn)||packageIn.length!==3||!packageIn.every(positive)||!positive(packedWeightLb)) return {valid:false,reason:'INVALID_PARCEL'};
  const [l,w,h]=packageIn.map(Math.ceil).sort((a,b)=>b-a), cube=l*w*h, girth=l+2*(w+h);
  const dimensionHandling=l>48||w>30||girth>105||cube>10368;
  const large=l>96||girth>130||cube>17280||packedWeightLb>110;
  const overMax=l>108||girth>165||packedWeightLb>150;
  const dimLb=Math.ceil(cube/139);
  return {valid:true,roundedIn:[l,w,h],cubeIn:cube,lengthAndGirth:girth,upsDailyDimLb:dimLb,
    additionalHandling:dimensionHandling||packedWeightLb>50||h<=1,
    largePackage:large,overMax,
    upsBillableRiskLb:Math.max(Math.ceil(packedWeightLb),dimLb,large?90:dimensionHandling?(date>='2026-12-21'?50:40):0),
    note:'Risk screen only. Rates and negotiated DIM rules come from the Shopify quote; this function adds no carrier fee.'};
}
export function compareCost(estimatedCents, actualCents) {
  if(!int(estimatedCents)||!int(actualCents))return {passed:false,reason:'COST_EVIDENCE_MISSING'};
  const shortfallCents=Math.max(0,actualCents-estimatedCents),overchargeCents=Math.max(0,estimatedCents-actualCents);
  const shortfallLimitCents=Math.min(1500,Math.max(500,Math.round(actualCents*0.20)));
  const overchargeLimitCents=Math.max(1000,Math.round(actualCents*0.25));
  return {passed:shortfallCents<=shortfallLimitCents&&overchargeCents<=overchargeLimitCents,shortfallCents,overchargeCents,shortfallLimitCents,overchargeLimitCents,
    majorShortfall:shortfallCents>shortfallLimitCents,
    reason:shortfallCents>shortfallLimitCents?'SHORTFALL_OUTSIDE_WORKING_TOLERANCE':overchargeCents>overchargeLimitCents?'UNCOMPETITIVE_ESTIMATE':null};
}
const exception = (...reasons) => ({state:'manual-quote',shippingCents:null,markupBasisPoints:0,handlingCents:0,reasons:[...new Set(reasons)]});
function option(line,key) { return (line.options??[]).find(([k])=>k.toLowerCase()===key)?.[1]??''; }
function recipe(line,family) {
  const [long,short]=[...line.size].sort((a,b)=>b-a);
  if(family.kind==='styrene-strip')return long<=36&&short<=10?{key:'styrene-strip-bulk',packageIn:[40,14,8],tare:5,capacity:120}:null;
  if(family.kind==='roll') {
    if(long>120)return null;
    if(short<=36)return {key:'roll-standard',packageIn:[40,6,6],tare:2,capacity:family.capacity};
    // Keep the <=48-inch carrier-length boundary separate. Wide artwork stays rolled,
    // never folded. Four inches allow for end protection; the 56-inch band includes
    // carrier additional handling in the observed Shopify quote, not an added fee.
    if(short<=40)return {key:'roll-40',packageIn:[44,8,8],tare:3,capacity:Math.min(5,family.capacity)};
    if(short<=52)return {key:'roll-52',packageIn:[56,8,8],tare:3,capacity:Math.min(5,family.capacity)};
    return null;
  }
  if(long<=30&&short<=20)return {key:'panel-small',packageIn:[32,22,4],tare:3,capacity:family.capacity};
  if(long<=38&&short<=30)return {key:'panel-medium',packageIn:[40,32,4],tare:5,capacity:Math.min(6,family.capacity)};
  if(long<=48&&short<=28)return {key:'panel-long',packageIn:[50,30,3],tare:5,capacity:Math.min(3,family.capacity)};
  return null;
}
export function planCart(cart) {
  if(cart.delivery==='pickup')return {state:'pickup',shippingCents:0,markupBasisPoints:0,handlingCents:0,parcels:[]};
  if(cart.delivery!=='ship')return exception('DELIVERY_CHOICE_REQUIRED');
  if(cart.destination?.countryCode!=='US'||!regionFor(cart.destination?.provinceCode)||!/^[0-9]{5}(?:-[0-9]{4})?$/.test(cart.destination?.zip??''))return exception('DESTINATION_OUTSIDE_TESTED_CONTIGUOUS_US_SCOPE');
  if(cart.heldStock===true)return exception('EXPRESS_ONE_RELEASE_UNITS_REQUIRED');
  const region=regionFor(cart.destination.provinceCode), groups=new Map(),reasons=[];
  const lines=(cart.lines??[]).filter(l=>l.quantity!==0&&l.requiresShipping!==false);
  if(!lines.length)return exception('EMPTY_PHYSICAL_CART');
  for(const line of lines){
    const compactSpec=compact[line.handle];
    if(compactSpec){
      const size=line.size??compactSpec.defaultSize;
      if(!int(line.quantity)||!Array.isArray(size)||size.length!==2||!size.every(positive)||Math.max(...size)>compactSpec.maxLong||Math.min(...size)>compactSpec.maxShort){reasons.push('COMPACT_PRODUCT_OUTSIDE_PACKAGE_BOUNDARY');continue;}
      const key='compact-in-house';
      const group=groups.get(key)??{origin:RATE_ORIGIN.id,region,family:key,packageKey:key,packageIn:[12,9,4],tare:1,capacity:25,units:[],lineIds:[],compactCounts:{}};
      const count=(group.compactCounts[line.handle]??0)+line.quantity;
      if(count>compactSpec.maxUnits){reasons.push('COMPACT_BULK_PACKAGE_REQUIRED');continue;}
      group.compactCounts[line.handle]=count;
      for(let i=0;i<line.quantity;i++)group.units.push(compactSpec.unitLb);
      group.lineIds.push(line.id);groups.set(key,group);continue;
    }
    if(!int(line.quantity)||!Array.isArray(line.size)||line.size.length!==2||!line.size.every(positive)){reasons.push('INVALID_QUANTITY_OR_PRODUCT_SIZE');continue;}
    const [long,short]=[...line.size].sort((a,b)=>b-a);
    if(rigid.has(line.handle)&&(long>48||short>36))return {state:'pickup-only',shippingCents:null,pickupAddress:'8680 Troy St., Spring Valley, CA 91977',reasons:['RIGID_PRODUCT_OVER_48_BY_36'],markupBasisPoints:0,handlingCents:0};
    // Owner requested quote-only for this maximum size. The assumed box footprint
    // is 50 × 38 in; packed depth/weight still determine the oversize charge.
    if(rigid.has(line.handle)&&long===48&&short===36)return exception('PACKING_CONFIRMATION_REQUIRED_48_BY_36');
    const family=families[line.handle];if(!family){reasons.push('FAMILY_NOT_YET_SUPPORTED:'+line.handle);continue;}
    const material=option(line,'material');
    if(family.requiresMaterial&&!material){reasons.push('MATERIAL_OUTSIDE_REPRESENTATIVE_RECIPE');continue;}
    if(family.allowedMaterial&&material&&!family.allowedMaterial.test(material)){reasons.push('MATERIAL_OUTSIDE_REPRESENTATIVE_RECIPE');continue;}
    if(/^(yes|with)/i.test(option(line,'h-stake')||option(line,'yard stake'))||/hardware|pole set|frame included/i.test((line.options??[]).map(p=>p.join(':')).join(';'))){reasons.push('ADDED_HARDWARE_PACKAGE_REQUIRED');continue;}
    const pack=recipe(line,family);if(!pack){reasons.push('SIZE_OUTSIDE_REPRESENTATIVE_PACKAGE');continue;}
    // Customer prices always use Spring Valley. Supplier/dispatch locations are irrelevant to this policy.
    const origin=RATE_ORIGIN.id;
    // Different materials are separate parcels. Artwork versions of one material may share a carton.
    const key=JSON.stringify([origin,line.handle,material,pack.key]);
    const group=groups.get(key)??{origin,region,family:line.handle,packageKey:pack.key,packageIn:pack.packageIn,tare:pack.tare,capacity:pack.capacity,units:[],lineIds:[]};
    const unitWeight=line.size[0]*line.size[1]/144*family.densityLbPerSqFt;
    if(line.quantity>120){reasons.push('BULK_QUANTITY_REQUIRES_PACKAGE_CHECK');continue;}
    for(let i=0;i<line.quantity;i++)group.units.push(unitWeight);
    group.lineIds.push(line.id);groups.set(key,group);
  }
  if(reasons.length)return {...exception(...reasons),partialGroups:groups.size};
  const parcels=[];
  for(const group of groups.values()){
    if(group.family==='compact-in-house'){
      const packedWeightLb=Math.ceil(group.tare+group.units.reduce((n,w)=>n+w,0));
      if(packedWeightLb>5||group.units.length>25)return exception('COMPACT_BULK_PACKAGE_REQUIRED');
      const parcel={origin:group.origin,region:group.region,family:group.family,packageKey:group.packageKey,packageIn:group.packageIn,packedWeightLb,unitCount:group.units.length,lineIds:group.lineIds,packingBasis:'Representative 12 × 9 × 4 in in-house carton, 5 lb rate band; up to 25 small name badges, 10 Photo IDs or 10 placards, subject to combined limits. Not measured.'};
      parcels.push({...parcel,risk:parcelRisk(parcel)});continue;
    }
    // A bounded stack recipe is specific to the panel dimensions and thickness.
    const groupLines=lines.filter(l=>group.lineIds.includes(l.id));
    const testedStackSize=group.family==='coroplast'&&groupLines.every(l=>Math.max(...l.size)===28&&Math.min(...l.size)===18);
    const standardBulk=group.family==='coroplast'&&groupLines.every(l=>Math.max(...l.size)===24&&Math.min(...l.size)===18)&&group.units.length>=13&&group.units.length<=25;
    if(standardBulk){
      // 25 x 4 mm = 3.94 in stack; 2 in allowance for protective packing.
      // About 15 lb of panels + 5 lb carton/padding. This is a representative package estimate.
      // Rate this bulk carton once, regardless of the number of artwork jobs.
      const parcel={origin:group.origin,region:group.region,family:group.family,packageKey:'coroplast-24x18-bulk25',packageIn:[28,22,6],packedWeightLb:20,unitCount:group.units.length,lineIds:group.lineIds,packingBasis:'Representative 13–25-copy 4 mm 24 × 18 in carton; 20 lb upper-band estimate including packing; not measured'};
      parcels.push({...parcel,risk:parcelRisk(parcel)});continue;
    }
    const maxUnits=group.family==='coroplast'?(testedStackSize?16:12):group.family==='aluminum-sign'?6:group.capacity;
    if(group.units.length>maxUnits)return exception('BULK_GROUPING_OUTSIDE_TESTED_FAMILY_BOUNDARY');
    for(let i=0;i<group.units.length;i+=group.capacity){
      const weights=group.units.slice(i,i+group.capacity), packedWeightLb=Math.ceil(group.tare+weights.reduce((a,b)=>a+b,0));
      const parcel={origin:group.origin,region:group.region,family:group.family,packageKey:group.packageKey,packageIn:group.packageIn,packedWeightLb,unitCount:weights.length,lineIds:group.lineIds,packingBasis:'Representative physical estimate; not individually measured'};
      const risk=parcelRisk(parcel);if(risk.overMax||risk.largePackage||packedWeightLb>40)return exception('BULK_OR_LARGE_PACKAGE_RATE_REQUIRED');
      parcels.push({...parcel,risk});
    }
  }
  return {state:'planned',region,parcels,markupBasisPoints:0,handlingCents:0};
}
export function estimateCart(cart,table,{now='2026-11-17',requireValidated=true}={}) {
  const plan=planCart(cart);if(plan.state!=='planned')return plan;
  if(now>=DESTINATION_POLICY.reviewBefore)return exception('DESTINATION_POLICY_REVIEW_REQUIRED');
  const deliveryClass=destinationClass(cart.destination);
  const rated=[],reasons=[];
  for(const parcel of plan.parcels){
    const candidates=table.filter(r=>r.packageKey===parcel.packageKey&&r.origin===parcel.origin&&r.region===parcel.region&&
      (!r.destinationClasses||r.destinationClasses.includes(deliveryClass))&&
      (!['remote','extended'].includes(deliveryClass)||r.destinationClasses?.includes(deliveryClass)||r.destinationZipPrefixes?.includes(cart.destination.zip.slice(0,5)))&&
      r.maxWeightLb>=parcel.packedWeightLb&&(!r.destinationStates||r.destinationStates.includes(cart.destination.provinceCode))&&
      (!r.destinationZipPrefixes||r.destinationZipPrefixes.some(p=>cart.destination.zip.startsWith(p)))&&
      r.observedOn<=now&&r.expiresOn>=now&&r.rateSource==='Shopify Shipping'&&r.currency==='USD'&&int(r.baseCents)&&
      r.evidenceIds?.length&&(!requireValidated||r.validation==='passed'));
    const specificity=r=>Math.max(0,...(r.destinationZipPrefixes??[]).map(p=>p.length))*10+(r.destinationStates?.length?1:0);
    candidates.sort((a,b)=>specificity(b)-specificity(a)||a.maxWeightLb-b.maxWeightLb||a.baseCents-b.baseCents);
    const row=candidates[0];
    if(!row){reasons.push('SHOPIFY_RATE_BAND_NOT_VALIDATED:'+parcel.origin+':'+parcel.packageKey+':'+parcel.region);continue;}
    // No reserve, handling, arbitrary multiplier, or line-count multiplication.
    rated.push({...parcel,destinationClass:deliveryClass,rateId:row.id,baseCents:row.baseCents,carrier:row.carrier,evidenceIds:row.evidenceIds});
  }
  if(reasons.length)return {...exception(...reasons),plannedParcels:plan.parcels.length,ratedParcels:rated.length};
  const shippingCents=rated.reduce((n,p)=>n+p.baseCents,0);
  if(!int(shippingCents)||shippingCents>10000000)return exception('INVALID_SHIPPING_TOTAL');
  return {state:requireValidated?'estimated':'candidate',shippingCents,markupBasisPoints:0,handlingCents:0,parcels:rated,rateBasis:'Unmodified Shopify Shipping representative-package quotes',productionEnabled:false};
}
