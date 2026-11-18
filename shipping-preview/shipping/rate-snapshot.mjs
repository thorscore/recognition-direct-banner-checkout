import fs from 'node:fs';
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
 return {id:s.id,rows:s.rateTable.length,observations:s.observations.length,firstExpiry:s.rateTable.map(r=>r.expiresOn).sort()[0],originZip:'91977',markupBasisPoints:0,handlingCents:0,activated:false};
}
export function readRateSnapshot(path,options){const s=JSON.parse(fs.readFileSync(path,'utf8'));validateRateSnapshot(s,options);return s;}
