export const TROY_LOCATION='gid://shopify/Location/97024180520';
export const TROY_ADDRESS={firstName:'Recognition Direct',lastName:'Pickup',address1:'8680 Troy Street',address2:'',city:'Spring Valley',provinceCode:'CA',zip:'91977',countryCode:'US'};
export const TROY_OPTIONS=`query ShippingCartTroyPickup($input: DraftOrderAvailableDeliveryOptionsInput!) {
 draftOrderAvailableDeliveryOptions(input: $input, localPickupCount: 20) {
  availableLocalPickupOptions { locationId handle code source }
  pageInfo { hasNextPage }
 }
}`;
export const TROY_CALCULATION=`mutation ShippingCartVerifyPickup($input: DraftOrderInput!) {
 draftOrderCalculate(input: $input) {
  calculatedDraftOrder {
   totalShippingPriceSet { shopMoney { amount currencyCode } }
   shippingLine { custom deliveryCategory code source }
  }
  userErrors { field message }
 }
}`;
const fail=code=>{throw Object.assign(new Error(code),{code,status:409,definitive:true});};
export async function resolveTroyPickupInput(input,graphql){
 if(input.customAttributes?.find(a=>a.key==='Shipping Delivery')?.value!=='pickup-spring-valley')return input;
 if(typeof graphql!=='function')fail('TROY_PICKUP_UNAVAILABLE');
 const r=await graphql(TROY_OPTIONS,{input:{lineItems:input.lineItems,shippingAddress:TROY_ADDRESS,acceptAutomaticDiscounts:false}}),available=r?.draftOrderAvailableDeliveryOptions;
 const matches=available?.availableLocalPickupOptions?.filter(p=>p.locationId===TROY_LOCATION);
 if(available?.pageInfo?.hasNextPage!==false||matches?.length!==1||!matches[0].handle||!matches[0].code||!matches[0].source)fail('TROY_PICKUP_UNAVAILABLE');
 const selected=matches[0];
 if(available.availableLocalPickupOptions.filter(p=>p.code===selected.code&&p.source===selected.source).length!==1)fail('TROY_PICKUP_UNAVAILABLE');
 const result={...structuredClone(input),shippingAddress:{...TROY_ADDRESS},shippingLine:{shippingRateHandle:selected.handle}};
 const checked=await graphql(TROY_CALCULATION,{input:result}),calculated=checked?.draftOrderCalculate;
 const shipping=calculated?.calculatedDraftOrder?.totalShippingPriceSet?.shopMoney,line=calculated?.calculatedDraftOrder?.shippingLine;
 if(calculated?.userErrors?.length!==0||shipping?.currencyCode!=='USD'||typeof shipping.amount!=='string'||!/^0(?:\.0{1,2})?$/.test(shipping.amount)||line?.custom!==false||line.deliveryCategory!=='pick-up'||line.code!==selected.code||line.source!==selected.source)fail('NATIVE_PICKUP_NEEDS_REVIEW');
 return result;
}
export async function createQuotedCartDraft(input,{graphql,createDraft}){
 let prepared;try{prepared=await resolveTroyPickupInput(input,graphql);}catch(e){e.definitive=true;throw e;}
 return createDraft(prepared);
}
