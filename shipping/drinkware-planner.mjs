const hold=reason=>({state:'manual-quote',shippingCents:null,parcels:[],reasons:[reason],markupBasisPoints:0,handlingCents:0});
export function planDrinkware(lines,destination,observations,{now}={}){
 if(!Array.isArray(lines)||!lines.length||lines.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<1))return hold('DRINKWARE_QUANTITY_INVALID');
 const quantity=lines.reduce((n,l)=>n+l.quantity,0);
 if(quantity>12)return hold('DRINKWARE_QUANTITY_OUTSIDE_TESTED_RANGE');
 if(destination?.countryCode!=='US')return hold('DRINKWARE_DESTINATION_UNVERIFIED');
 const zip=destination.zip?.slice(0,5),rows=observations.filter(q=>q.originZip==='91977'&&q.destinationZip===zip&&q.destinationState===destination.provinceCode&&q.source==='Shopify Shipping calculator'&&q.observedOn<=now&&q.expiresOn>=now&&[1,2,4,12].includes(q.quantity)&&[q.upsGroundCents,q.fedexHomeDeliveryCents].every(c=>Number.isSafeInteger(c)&&c>0));
 if(new Set(rows.map(r=>r.quantity)).size!==4)return hold('DRINKWARE_RATE_EVIDENCE_REQUIRED');
 const packages=[1,2,4,12].map(capacity=>{
  const q=rows.filter(r=>r.quantity===capacity).sort((a,b)=>b.observedOn.localeCompare(a.observedOn))[0];
  const ups=q.upsGroundCents<=q.fedexHomeDeliveryCents;
  return {capacity,baseCents:ups?q.upsGroundCents:q.fedexHomeDeliveryCents,carrier:ups?'UPS':'FedEx',service:ups?'Ground':'Home Delivery',packageIn:q.packageIn,packedWeightLb:q.packedWeightLb,rateId:q.id,evidenceIds:[q.id],origin:'rd-troy',family:'drinkware',packingBasis:'Representative carton estimate; Shopify calculator quote; no markup or handling'};
 });
 // Choose the least expensive combination of the quoted cartons. A larger
 // quoted carton may hold fewer units; unused space is not an extra fee.
 const best=[{cents:0,boxes:[]}];
 for(let needed=1;needed<=quantity;needed++){
  const choices=packages.map(p=>{const remainder=best[Math.max(0,needed-p.capacity)];return {cents:p.baseCents+remainder.cents,boxes:[p,...remainder.boxes]};});
  choices.sort((a,b)=>a.cents-b.cents||a.boxes.length-b.boxes.length);best[needed]=choices[0];
 }
 const remaining=lines.map(l=>({...l}));
 const parcels=best[quantity].boxes.map(p=>{
  let available=p.capacity;const allocations=[];
  for(const line of remaining){const units=Math.min(available,line.quantity);if(units){allocations.push({lineId:line.id,quantity:units});available-=units;line.quantity-=units;}}
  return {...p,unitCount:allocations.reduce((n,a)=>n+a.quantity,0),lineIds:allocations.map(a=>a.lineId),allocations};
 });
 if(remaining.some(l=>l.quantity!==0))return hold('DRINKWARE_ALLOCATION_INCOMPLETE');
 return {state:'estimated',shippingCents:best[quantity].cents,parcels,quantity,markupBasisPoints:0,handlingCents:0};
}
