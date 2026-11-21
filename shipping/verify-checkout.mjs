export const VERIFY_QUOTED_CHECKOUT=`mutation ShippingVerifyQuotedCheckout($input: DraftOrderInput!) {
 draftOrderCalculate(input: $input) {
  calculatedDraftOrder {
   subtotalPriceSet { shopMoney { amount currencyCode } }
   totalShippingPriceSet { shopMoney { amount currencyCode } }
   totalTaxSet { shopMoney { amount currencyCode } }
   totalPriceSet { shopMoney { amount currencyCode } }
  }
  userErrors { field message }
 }
}`;
const fail=code=>{throw Object.assign(Error(code),{code,status:409,definitive:true});};
const cents=m=>{if(m?.currencyCode!=='USD'||typeof m.amount!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(m.amount))fail('CHECKOUT_CURRENCY_INVALID');const [a,b='']=m.amount.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n))fail('CHECKOUT_AMOUNT_INVALID');return n;};
export async function verifyQuotedCheckout(input,{graphql,expectedProductSubtotalCents}={}){
 if(typeof graphql!=='function')fail('CHECKOUT_CALCULATION_UNAVAILABLE');
 const expected=cents(input.shippingLine?.priceWithCurrency);
 if(!Number.isSafeInteger(expectedProductSubtotalCents)||expectedProductSubtotalCents<0)fail('CHECKOUT_SUBTOTAL_REQUIRED');
 const data=await graphql(VERIFY_QUOTED_CHECKOUT,{input});const r=data?.draftOrderCalculate,c=r?.calculatedDraftOrder;
 if(!c||!Array.isArray(r.userErrors)||r.userErrors.length)fail('CHECKOUT_CALCULATION_REJECTED');
 const subtotalCents=cents(c.subtotalPriceSet?.shopMoney),shippingCents=cents(c.totalShippingPriceSet?.shopMoney),taxCents=cents(c.totalTaxSet?.shopMoney),totalCents=cents(c.totalPriceSet?.shopMoney);
 if(shippingCents!==expected)fail('CHECKOUT_SHIPPING_CHANGED');
 if(subtotalCents!==expectedProductSubtotalCents)fail('CHECKOUT_PRICES_CHANGED');
 if(totalCents!==subtotalCents+shippingCents+taxCents)fail('CHECKOUT_TOTALS_CHANGED');
 return {subtotalCents,shippingCents,taxCents,totalCents,currencyCode:'USD',createsDraft:false,createsOrder:false,chargesPayment:false};
}
