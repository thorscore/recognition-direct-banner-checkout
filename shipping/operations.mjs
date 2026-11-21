import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parcelRisk} from './estimate-engine.mjs';
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code,status:409});};
const integer=x=>Number.isSafeInteger(x)&&x>0;
export function shippingOperations({path=':memory:',now=Date.now}={}){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS shipping_reviews(id TEXT PRIMARY KEY,binding TEXT UNIQUE NOT NULL,target TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,updated INTEGER NOT NULL,record TEXT NOT NULL)');
 const decode=row=>row?JSON.parse(row.record):null;
 const read=id=>decode(db.prepare('SELECT record FROM shipping_reviews WHERE id=?').get(id));
 const persist=r=>db.prepare('INSERT INTO shipping_reviews VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,revision=excluded.revision,updated=excluded.updated,record=excluded.record').run(r.id,r.binding,r.target,r.status,r.revision,r.updatedAt,JSON.stringify(r));
 const transaction=f=>{db.exec('BEGIN IMMEDIATE');try{const r=f();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 function context(cart,destination,contact,lines){return {target:cart.id,cartHash:digest({id:cart.id,version:cart.version??0,status:cart.status,items:cart.items}),destination,contact,lines};}
 function bind(c){return digest(c);}
 function supersede(c){const binding=bind(c);for(const row of db.prepare("SELECT record FROM shipping_reviews WHERE target=? AND binding<>? AND status IN ('pending','approved')").all(c.target,binding)){const r=decode(row);r.status='superseded';r.revision++;r.updatedAt=now();persist(r);}}
 function pending(c,reason){return transaction(()=>{supersede(c);const binding=bind(c),prior=decode(db.prepare('SELECT record FROM shipping_reviews WHERE binding=?').get(binding));if(prior?.status==='pending')return prior;const r={id:prior?.id??randomUUID(),binding,target:c.target,context:c,status:'pending',revision:(prior?.revision??0)+1,createdAt:prior?.createdAt??now(),updatedAt:now(),reason,approval:null};persist(r);return r;});}
 function approved(c){const r=decode(db.prepare("SELECT record FROM shipping_reviews WHERE binding=? AND status='approved'").get(bind(c)));return r&&r.approval.expiresAt>now()?r:null;}
 function approve(id,{revision,reviewedWholeCart,source,originZip,observedAt,parcels,approvedBy}={}){return transaction(()=>{
  const r=read(id);if(!r||r.status!=='pending'||r.revision!==revision)fail('SHIPPING_REVIEW_STALE');
  if(reviewedWholeCart!==true||source!=='Shopify Shipping calculator'||originZip!=='91977'||!Number.isSafeInteger(observedAt)||observedAt>now()||observedAt<now()-86400000)fail('FRESH_SHOPIFY_EVIDENCE_REQUIRED');
  if(!Array.isArray(parcels)||!parcels.length||parcels.length>100)fail('COMPLETE_PARCEL_QUOTES_REQUIRED');
  const expected=new Map(r.context.lines.map(l=>[l.id,l.quantity])),covered=new Map();
  const rated=parcels.map(p=>{
   if(!parcelRisk(p).valid||parcelRisk(p).overMax||!Array.isArray(p.allocations)||!p.allocations.length)fail('PARCEL_REQUIRES_SPECIALIST_REVIEW');
   for(const a of p.allocations){if(!expected.has(a.lineId)||!integer(a.quantity))fail('PARCEL_ALLOCATION_INVALID');covered.set(a.lineId,(covered.get(a.lineId)??0)+a.quantity);}
   const quotes=p.quotes;if(!Array.isArray(quotes)||!quotes.length||quotes.length>2||quotes.some(q=>!integer(q.cents)||q.cents>1000000||!(q.carrier==='UPS'&&q.service==='Ground'||q.carrier==='FedEx'&&q.service==='Home Delivery'))||new Set(quotes.map(q=>q.carrier)).size!==quotes.length)fail('GROUND_QUOTE_REQUIRED');
   if(quotes.length===1&&(!['UPS unavailable','FedEx unavailable'].includes(p.unavailable)||p.unavailable.startsWith(quotes[0].carrier)))fail('SECOND_CARRIER_STATUS_REQUIRED');
   const lowest=[...quotes].sort((a,b)=>a.cents-b.cents)[0];return {origin:'rd-troy',family:'owner-verified',packageIn:p.packageIn,packedWeightLb:p.packedWeightLb,lineIds:p.allocations.map(a=>a.lineId),unitCount:p.allocations.reduce((n,a)=>n+a.quantity,0),allocations:p.allocations,baseCents:lowest.cents,carrier:lowest.carrier,service:lowest.service,evidenceIds:[r.id],packingBasis:'Owner reviewed complete cart against fresh Shopify Shipping calculator quotes',quotes};
  });
  if([...expected].some(([id,n])=>covered.get(id)!==n))fail('COMPLETE_CART_COVERAGE_REQUIRED');
  r.status='approved';r.revision++;r.updatedAt=now();r.approval={approvedBy:approvedBy??null,observedAt,expiresAt:Math.min(now()+72*3600000,observedAt+72*3600000),source,originZip,result:{state:'estimated',delivery:'ship',shippingCents:rated.reduce((n,p)=>n+p.baseCents,0),markupBasisPoints:0,handlingCents:0,parcels:rated,manualReview:{id:r.id,revision:r.revision}}};persist(r);return r;
 });}
 return {context,pending,approved,approve,read,supersede:c=>transaction(()=>supersede(c)),list:()=>db.prepare("SELECT record FROM shipping_reviews ORDER BY updated DESC LIMIT 100").all().map(decode),close:()=>db.close()};
}
