// Uses the existing app's GraphQL transport. No order or payment mutations exist here.
import {isDeepStrictEqual} from 'node:util';
export const SHOP='f375fe-2d.myshopify.com';
const M='{shopMoney{amount currencyCode} presentmentMoney{amount currencyCode}}';
export const READ_ORDER=`query PrivateTumblerPaidOrder($id:ID!){shop{myshopifyDomain} order(id:$id){id name test email updatedAt fullyPaid cancelledAt displayFinancialStatus displayFulfillmentStatus shippingAddress{firstName lastName address1 address2 city provinceCode countryCodeV2 zip} currentSubtotalPriceSet ${M} currentShippingPriceSet ${M} currentTotalTaxSet ${M} currentTotalPriceSet ${M} totalOutstandingSet ${M} totalRefundedSet ${M} currentTotalDiscountsSet ${M} transactionsCount{count precision} transactions(first:100){kind status amountSet ${M}} shippingLine{title source code custom deliveryCategory} refunds(first:1){id} lineItems(first:5){pageInfo{hasNextPage} nodes{id quantity currentQuantity sku product{id} variant{id} originalUnitPriceSet ${M} customAttributes{key value}}}}}`;
export const READ_SUBSCRIPTIONS='query PrivateTumblerSubscriptions($uri:String!){webhookSubscriptions(first:100,uri:$uri){pageInfo{hasNextPage} nodes{id topic uri}}}';
export const CREATE_SUBSCRIPTION='mutation PrivateTumblerReceiver($topic:WebhookSubscriptionTopic!,$webhookSubscription:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$webhookSubscription){webhookSubscription{id topic uri} userErrors{field message}}}';
const fail=code=>{throw Object.assign(Error(code),{code,status:409});};
export function cents(value){if(typeof value!=='string'||!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))fail('USD_AMOUNT_INVALID');const [a,b='']=value.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
export function money(bag){const a=bag?.shopMoney,b=bag?.presentmentMoney;if(a?.currencyCode!=='USD'||b?.currencyCode!=='USD'||cents(a.amount)!==cents(b.amount))fail('USD_MONEY_REQUIRED');return cents(a.amount);}
const legacy=(id,type)=>{if(typeof id!=='string'||!new RegExp('^gid://shopify/'+type+'/[1-9][0-9]*$').test(id))fail('SHOPIFY_REFERENCE_INVALID');return id.split('/').at(-1);};
export function normalizeOrder(data,{now=Date.now}={}){
 if(data?.shop?.myshopifyDomain!==SHOP)fail('SHOPIFY_STORE_MISMATCH');const o=data.order;if(!o)fail('SHOPIFY_ORDER_NOT_FOUND');
 if(o.lineItems.pageInfo.hasNextPage||o.lineItems.nodes.length>4||o.transactionsCount?.precision!=='EXACT'||o.transactionsCount.count!==o.transactions.length)fail('COMPLETE_PRIVATE_ORDER_REQUIRED');
 const ship=money(o.currentShippingPriceSet),subtotal=money(o.currentSubtotalPriceSet),tax=money(o.currentTotalTaxSet),total=money(o.currentTotalPriceSet);
 const shipping=o.shippingLine;let delivery;
 if(shipping?.deliveryCategory==='pick-up'){
  if(shipping.custom!==false||shipping.source!=='shopify'||shipping.title!=='Spring Valley Print Shop'||ship!==0)fail('NATIVE_PICKUP_REVIEW_REQUIRED');
  delivery={method:'PICK_UP',locationId:'97024180520',location:'Spring Valley Print Shop',address:'8680 Troy St., Spring Valley CA 91977'};
 }else{
  if(!shipping||shipping.custom!==false||!/UPS.*Ground/i.test(shipping.title))fail('PRIVATE_SHIPPING_METHOD_REVIEW_REQUIRED');
  if(!o.shippingAddress?.address1||!o.shippingAddress.zip)fail('SHIPPING_ADDRESS_REQUIRED');
  delivery={method:'SHIP',service:'UPS Ground',origin:'8680 Troy St., Spring Valley CA 91977',address:o.shippingAddress};
 }
 const capture=o.transactions.filter(t=>t.status==='SUCCESS'&&['SALE','CAPTURE'].includes(t.kind)).reduce((n,t)=>n+money(t.amountSet),0);
 const order={id:legacy(o.id,'Order'),name:o.name,test:o.test,email:o.email,financial_status:o.fullyPaid&&o.displayFinancialStatus==='PAID'?'paid':String(o.displayFinancialStatus).toLowerCase(),cancelled_at:o.cancelledAt,fulfillment_status:o.displayFulfillmentStatus==='UNFULFILLED'?null:o.displayFulfillmentStatus,refunds:o.refunds.map(r=>({id:r.id})),updated_at:o.updatedAt,currency:'USD',subtotalCents:subtotal,shippingCents:ship,taxCents:tax,totalCents:total,captureCents:capture,totalOutstandingCents:money(o.totalOutstandingSet),totalRefundedCents:money(o.totalRefundedSet),discountCents:money(o.currentTotalDiscountsSet),delivery,line_items:o.lineItems.nodes.map(l=>{
  return {id:legacy(l.id,'LineItem'),product_id:legacy(l.product?.id,'Product'),variant_id:legacy(l.variant?.id,'ProductVariant'),sku:l.sku,quantity:l.quantity,unitCents:money(l.originalUnitPriceSet),properties:l.customAttributes.map(p=>({name:p.key,value:p.value}))};
 })};
 order.quantitiesUnchanged=o.lineItems.nodes.every(l=>l.quantity===l.currentQuantity);
 return {executionMode:'private-preview',shop:SHOP,observedAt:now(),order};
}
export function orderReader(graphql,{now=Date.now}={}){return async id=>{if(!/^[1-9][0-9]{0,15}$/.test(id))fail('ORDER_ID_INVALID');return normalizeOrder(await graphql(READ_ORDER,{id:'gid://shopify/Order/'+id}),{now});};}
export async function connectReceiver(graphql,base){
 const uri=new URL('/private-tumbler/webhooks',base).href;
 const data=await graphql(READ_SUBSCRIPTIONS,{uri});if(data.webhookSubscriptions.pageInfo.hasNextPage)fail('SUBSCRIPTION_LIST_INCOMPLETE');
 const result=[];for(const topic of ['ORDERS_PAID','ORDERS_CANCELLED','REFUNDS_CREATE']){
  let rows=data.webhookSubscriptions.nodes.filter(r=>r.topic===topic&&r.uri===uri);if(rows.length>1)fail('DUPLICATE_PRIVATE_SUBSCRIPTIONS');
  if(!rows.length){const created=await graphql(CREATE_SUBSCRIPTION,{topic,webhookSubscription:{uri,format:'JSON'}});if(created.webhookSubscriptionCreate.userErrors.length||!created.webhookSubscriptionCreate.webhookSubscription)fail('PRIVATE_RECEIVER_CONNECT_FAILED');rows=[created.webhookSubscriptionCreate.webhookSubscription];}
  result.push(rows[0]);
 }
 const readback=await graphql(READ_SUBSCRIPTIONS,{uri});for(const row of result)if(!readback.webhookSubscriptions.nodes.some(r=>isDeepStrictEqual(r,row)))fail('PRIVATE_RECEIVER_READBACK_FAILED');return result;
}
