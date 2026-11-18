export const ADDRESS_FIELDS=['address1','address2','city','provinceCode','zip'];
export function deliveryFormState(cart,places){
 const locked=cart.caseId==='review',saved=cart.destination;
 const fallback=cart.caseId==='mixed'?'eastport':cart.caseId==='native'?'seattle':'springvalley';
 const selectedId=locked?'pinevalley':Object.keys(places).find(k=>saved&&places[k].zip===saved.zip&&places[k].provinceCode===saved.provinceCode)??fallback;
 const destination=locked?places.pinevalley:saved??places[selectedId];
 const corrected=Boolean(locked&&saved&&ADDRESS_FIELDS.some(k=>(saved[k]??'')!==(destination[k]??'')));
 return {locked,selectedId,destination,corrected,showRecheck:Boolean(cart.reviewId&&!cart.quote&&!corrected),notice:locked?'Approval practice uses a recorded quote to Pine Valley, CA 91962. This test address is fixed. To try New York or another destination, use a normal sample cart below.':'Choose a test destination or enter a delivery address.'};
}
