import {badgeContactShopifyFields,badgeContactNote} from '../badge-order-contact.mjs';
import {fail} from '../photo-id-pilot/auth.mjs';
export const SHOP='f375fe-2d.myshopify.com',PICKUP_ID='gid://shopify/Location/97024180520';
export const shippingCents=quantity=>quantity>=50?1995:1295;
export const IDENTITY='query PhotoIdIdentity {shop{myshopifyDomain currencyCode}}';
export const DELIVERY='query PhotoIdPickup($input:DraftOrderAvailableDeliveryOptionsInput!){draftOrderAvailableDeliveryOptions(input:$input,localPickupCount:20){availableLocalPickupOptions{locationId handle code source} pageInfo{hasNextPage}}}';
export const CREATE='mutation PhotoIdCheckout($input:DraftOrderInput!){draftOrderCreate(input:$input){draftOrder{id} userErrors{field message}}}';
const MONEY='{shopMoney{amount currencyCode}}';
const lines=(order=false)=>`lineItems(first:2){nodes{title quantity ${order?'currentQuantity':''} requiresShipping taxable originalUnitPriceSet ${MONEY} customAttributes{key value}} pageInfo{hasNextPage}}`;
export const READ=`query PhotoPilotDraft($id:ID!){draftOrder(id:$id){id status invoiceUrl subtotalPriceSet ${MONEY} totalShippingPriceSet ${MONEY} totalPriceSet ${MONEY} shippingLine{title code source custom deliveryCategory} ${lines()} order{id name test email fullyPaid displayFinancialStatus displayFulfillmentStatus cancelledAt subtotalPriceSet ${MONEY} totalPriceSet ${MONEY} totalRefundedSet ${MONEY} totalShippingPriceSet ${MONEY} ${lines(true)} transactions(first:20){kind status test gateway amountSet ${MONEY}}}}}`;
export const PICKUP_ADDRESS={firstName:'Recognition',lastName:'Direct',address1:'8680 Troy St.',city:'Spring Valley',provinceCode:'CA',countryCode:'US',zip:'91977'};
export const moneyCents=value=>value?.shopMoney?.currencyCode==='USD'&&/^\d+(?:\.\d{1,2})?$/.test(value.shopMoney.amount)?Math.round(Number(value.shopMoney.amount)*100):null;
export const reference='_rd_photo_id';
export function lineFor(run){return {title:run.side==='front-only'?'Photo ID Badges — Front only':'Photo ID Badges — Front and back',quantity:run.quantity,requiresShipping:true,taxable:true,originalUnitPriceWithCurrency:{amount:(run.unitCents/100).toFixed(2),currencyCode:'USD'},customAttributes:[{key:reference,value:run.id}]};}
function sameLine(connection,run){const line=connection?.nodes?.[0],expected=lineFor(run);return connection?.pageInfo?.hasNextPage===false&&connection.nodes.length===1&&line.title===expected.title&&line.quantity===run.quantity&&line.requiresShipping===true&&line.taxable===true&&moneyCents(line.originalUnitPriceSet)===run.unitCents&&line.customAttributes?.some(a=>a.key===reference&&a.value===run.id);}
export function verifyDraft(draft,run){
 if(!draft||draft.id!==run.draftId||!sameLine(draft.lineItems,run)||moneyCents(draft.subtotalPriceSet)!==run.subtotalCents||moneyCents(draft.totalShippingPriceSet)!==(run.delivery==='troy'?0:shippingCents(run.quantity)))fail(409,'DRAFT_DETAILS_NEED_REVIEW');
 if(run.delivery==='troy'&&(draft.shippingLine?.custom!==false||draft.shippingLine.deliveryCategory!=='pick-up'||draft.shippingLine.code!==run.pickup.code||draft.shippingLine.source!==run.pickup.source))fail(409,'NATIVE_PICKUP_NEEDS_REVIEW');
 let url;try{url=new URL(draft.invoiceUrl||(draft.order&&run.checkoutUrl));}catch{fail(409,'CHECKOUT_LINK_UNVERIFIED');}
 if(url.protocol!=='https:'||![SHOP,'recognition-direct.com'].includes(url.hostname)||url.username||url.password||!/^\/(?:\d+\/)?invoices\/[a-z0-9_-]+\/?$/i.test(url.pathname))fail(409,'CHECKOUT_LINK_UNVERIFIED');
 const order=draft.order;
 if(!order||!order.fullyPaid||order.displayFinancialStatus!=='PAID')return {checkoutUrl:url.href,paid:false};
 const transactions=order.transactions;
 if(order.test!==false||order.cancelledAt||order.email?.toLowerCase()!==run.email||!sameLine(order.lineItems,run)||order.lineItems.nodes[0].currentQuantity!==run.quantity||moneyCents(order.subtotalPriceSet)!==run.subtotalCents||moneyCents(order.totalShippingPriceSet)!==(run.delivery==='troy'?0:shippingCents(run.quantity))||moneyCents(order.totalRefundedSet)!==0||!Array.isArray(transactions)||transactions.length>=20||transactions.some(t=>t.kind==='REFUND'))fail(409,'PAYMENT_NEEDS_REVIEW');
 const captures=transactions.filter(t=>['SALE','CAPTURE'].includes(t.kind)&&t.status==='SUCCESS');
 if(!captures.length||captures.some(t=>t.test!==false||moneyCents(t.amountSet)===null)||captures.reduce((n,t)=>n+moneyCents(t.amountSet),0)!==moneyCents(order.totalPriceSet))fail(409,'PAYMENT_CAPTURE_UNVERIFIED');
 return {checkoutUrl:url.href,paid:true,orderId:order.id,orderName:order.name,totalCents:moneyCents(order.totalPriceSet)};
}

export function createPhotoShopify({graphql,shop,base}){
 const configured=typeof graphql==='function'&&shop==='f375fe-2d';
 async function connect(){if(!configured)fail(503,'CHECKOUT_SETUP_REQUIRED');const d=await graphql(IDENTITY,{});if(d.shop?.myshopifyDomain!==SHOP||d.shop.currencyCode!=='USD')fail(403,'LIVE_STORE_REQUIRED');}
 return {configured,
  async preflight(run){await connect();if(run.delivery!=='troy')return null;const d=await graphql(DELIVERY,{input:{shippingAddress:PICKUP_ADDRESS,lineItems:[lineFor(run)],acceptAutomaticDiscounts:false}}),options=d.draftOrderAvailableDeliveryOptions,matches=options?.availableLocalPickupOptions?.filter(o=>o.locationId===PICKUP_ID);if(options?.pageInfo?.hasNextPage!==false||matches?.length!==1||!matches[0].handle||!matches[0].code||!matches[0].source)fail(409,'TROY_PICKUP_UNAVAILABLE');return matches[0];},
  async create(run){await connect();const input={email:run.email,...badgeContactShopifyFields(run.contact),note:'Photo ID badges: proof approval is required before production. Staff review: '+base+'/photo-id/staff#job='+run.jobId+(run.contact?'\n\n'+badgeContactNote(run.contact):''),tags:['photo-id-badges','proof-required','rd-photo-id',run.delivery==='troy'?'pickup-spring-valley':'ship'],presentmentCurrencyCode:'USD',lineItems:[lineFor(run)],...(run.delivery==='troy'?{shippingAddress:PICKUP_ADDRESS}:{}),shippingLine:run.delivery==='troy'?{shippingRateHandle:run.pickup.handle}:{title:run.quantity>=50?'Standard Shipping & Handling':'Small Package Shipping & Handling',priceWithCurrency:{amount:(shippingCents(run.quantity)/100).toFixed(2),currencyCode:'USD'}},taxExempt:false,acceptAutomaticDiscounts:false,allowDiscountCodesInCheckout:false,useCustomerDefaultAddress:false};const d=await graphql(CREATE,{input}),result=d.draftOrderCreate,id=result?.draftOrder?.id;if(result?.userErrors?.length){if(/^gid:\/\/shopify\/DraftOrder\/[1-9]\d*$/.test(id??'')){const e=new Error('CREATE_RESULT_UNCERTAIN');e.code='CREATE_RESULT_UNCERTAIN';e.draftId=id;throw e;}fail(422,'TEST_DRAFT_REJECTED');}if(!/^gid:\/\/shopify\/DraftOrder\/[1-9]\d*$/.test(id??''))fail(502,'CREATE_RESULT_UNCERTAIN');return id;},
  async read(run){await connect();const d=await graphql(READ,{id:run.draftId});return verifyDraft(d.draftOrder,run);}
 };
}
