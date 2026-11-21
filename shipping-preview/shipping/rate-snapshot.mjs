import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {localDate} from './checkout-shipping.mjs';
const fail=message=>{throw Error(message);};
export function validateRateSnapshot(s,{now=Date.now(),allowExpired=false}={}){
 if(s?.schema!=='rd-shopify-shipping-snapshot.v1'||typeof s.id!=='string'||!Array.isArray(s.rateTable)||!s.rateTable.length||!Array.isArray(s.nativeEvidence)||!Array.isArray(s.observations))fail('RATE_SNAPSHOT_INVALID');
 const observations=new Map();for(const q of s.observations){if(observations.has(q.id))fail('DUPLICATE_OBSERVATION');observations.set(q.id,q);}
 const ids=new Set();for(const r of s.rateTable){
  if(ids.has(r.id))fail('DUPLICATE_RATE');ids.add(r.id);
  if(r.origin!=='rd-troy'||r.originAddress?.zip!=='91977'||r.rateSource!=='Shopify Shipping'||r.currency!=='USD'||r.validation!=='passed'||!Number.isSafeInteger(r.baseCents)||r.baseCents<=0||!Array.isArray(r.evidenceIds)||!r.evidenceIds.length)fail('RATE_POLICY_INVALID');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.observedOn)||!/^\d{4}-\d{2}-\d{2}$/.test(r.expiresOn)||r.observedOn>localDate(now)||!allowExpired&&r.expiresOn<localDate(now)||r.expiresOn<r.observedOn||Date.parse(r.expiresOn)-Date.parse(r.observedOn)>7*86400000)fail('FRESH_RATE_EVIDENCE_REQUIRED');
  for(const id of [...r.evidenceIds,...(r.supportingQuoteIds??[])]){
   const q=observations.get(id);if(!q||q.originZip!=='91977'||q.observedOn!==r.observedOn||JSON.stringify(q.packageIn)!==JSON.stringify(r.packageIn)||q.packedWeightLb!==r.maxWeightLb||!q.sourceReference||!/^\d{5}$/.test(q.destinationZip??''))fail('RATE_EVIDENCE_MISMATCH');
   const ground=q.rates?.filter(x=>x.carrier==='UPS'&&x.service==='Ground'||x.carrier==='FedEx'&&x.service==='Home Delivery');if(!ground?.length||ground.some(x=>!Number.isSafeInteger(x.cents)||x.cents<=0))fail('GROUND_EVIDENCE_REQUIRED');const lowest=[...ground].sort((a,b)=>a.cents-b.cents)[0];if(lowest.cents!==r.baseCents)fail('ZERO_MARKUP_RATE_MISMATCH');
  }
 }
 for(const q of s.nativeEvidence){if(q.origin!=='rd-troy'||q.originVerifiedOn!==q.date||!q.originEvidence||q.date>localDate(now)||!allowExpired&&(q.expiresOn??q.date)<localDate(now)||Date.parse(q.expiresOn??q.date)-Date.parse(q.date)>7*86400000)fail('NATIVE_FRESH_EVIDENCE_REQUIRED');}
 if(s.drinkwareEvidence!==undefined){
  if(!Array.isArray(s.drinkwareEvidence))fail('DRINKWARE_EVIDENCE_INVALID');
  const packing={1:[[14,6,6],3],2:[[14,10,6],4],4:[[14,10,10],7],12:[[20,16,14],20]};
  const seen=new Set();for(const q of s.drinkwareEvidence){
   if(seen.has(q.id)||q.originZip!=='91977'||q.source!=='Shopify Shipping calculator'||!/^[0-9]{5}$/.test(q.destinationZip)||!['CA','NY','ME','WA','TX','CO','IL','PA','NC','UT'].includes(q.destinationState)||![1,2,4,12].includes(q.quantity)||!Array.isArray(q.packageIn)||q.packageIn.length!==3||!q.packageIn.every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(q.packedWeightLb)||q.packedWeightLb<=0||![q.upsGroundCents,q.fedexHomeDeliveryCents].every(n=>Number.isSafeInteger(n)&&n>0)||q.selectedShippingCents!==Math.min(q.upsGroundCents,q.fedexHomeDeliveryCents)||q.markupBasisPoints!==0||q.handlingCents!==0)fail('DRINKWARE_EVIDENCE_INVALID');
   if(JSON.stringify(q.packageIn)!==JSON.stringify(packing[q.quantity][0])||q.packedWeightLb!==packing[q.quantity][1])fail('DRINKWARE_PACKING_MISMATCH');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(q.observedOn)||!/^\d{4}-\d{2}-\d{2}$/.test(q.expiresOn)||q.observedOn>localDate(now)||q.expiresOn<q.observedOn||Date.parse(q.expiresOn)-Date.parse(q.observedOn)>7*86400000||!allowExpired&&q.expiresOn<localDate(now))fail('DRINKWARE_FRESH_EVIDENCE_REQUIRED');seen.add(q.id);
  }
 }
 return {id:s.id,rows:s.rateTable.length,observations:s.observations.length,...(s.drinkwareEvidence?{drinkwareRows:s.drinkwareEvidence.length}:{}),firstExpiry:s.rateTable.map(r=>r.expiresOn).sort()[0],originZip:'91977',markupBasisPoints:0,handlingCents:0,activated:false};
}
export function readRateSnapshot(path,options){const s=JSON.parse(fs.readFileSync(path,'utf8'));validateRateSnapshot(s,options);return s;}
export function decodeRateSnapshot(encoded,options){
 if(typeof encoded!=='string'||!encoded.length||encoded.length>256000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('PRIVATE_RATE_SNAPSHOT_ENCODING_INVALID');
 let s;try{s=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:2*1024*1024}).toString('utf8'));}catch{fail('PRIVATE_RATE_SNAPSHOT_ENCODING_INVALID');}
 validateRateSnapshot(s,options);return s;
}

