import {fail,PILOT_OWNER} from './auth.mjs';
export const TEST_SHOP='recognition-direct-id-badge-test.myshopify.com';
export const CLIENT_ID='be3a1cde59bd09bc1bbc338ae607fdac';
export const APP_ID='gid://shopify/App/444573384705';
export const SHOP_ID='gid://shopify/Shop/84098253013';
export const PICKUP_ID='gid://shopify/Location/95026151637';
export const API_VERSION='2026-04';
export const IDENTITY=`query PhotoPilotIdentity {shop{id myshopifyDomain currencyCode} currentAppInstallation{app{id title} accessScopes{handle}}}`;
export const DELIVERY=`query PhotoPilotPickup($input:DraftOrderAvailableDeliveryOptionsInput!){draftOrderAvailableDeliveryOptions(input:$input,localPickupCount:20){availableLocalPickupOptions{locationId handle code source} pageInfo{hasNextPage}}}`;
export const CREATE=`mutation PhotoPilotCreate($input:DraftOrderInput!){draftOrderCreate(input:$input){draftOrder{id} userErrors{field message}}}`;
const MONEY='{shopMoney{amount currencyCode}}';
const lines=(order=false)=>`lineItems(first:2){nodes{title quantity ${order?'currentQuantity':''} requiresShipping taxable originalUnitPriceSet ${MONEY} customAttributes{key value}} pageInfo{hasNextPage}}`;
export const READ=`query PhotoPilotDraft($id:ID!){draftOrder(id:$id){id status invoiceUrl subtotalPriceSet ${MONEY} totalShippingPriceSet ${MONEY} totalPriceSet ${MONEY} shippingLine{title code source custom deliveryCategory} ${lines()} order{id name test email fullyPaid displayFinancialStatus displayFulfillmentStatus cancelledAt subtotalPriceSet ${MONEY} totalPriceSet ${MONEY} totalRefundedSet ${MONEY} ${lines(true)} transactions(first:20){kind status test gateway amountSet ${MONEY}}}}}`;
export const TEST_ADDRESS={firstName:'Recognition',lastName:'Direct',address1:'8680 Troy St.',city:'Spring Valley',provinceCode:'CA',countryCode:'US',zip:'91977'};
export const moneyCents=value=>value?.shopMoney?.currencyCode==='USD'&&/^\d+(?:\.\d{1,2})?$/.test(value.shopMoney.amount)?Math.round(Number(value.shopMoney.amount)*100):null;
export const reference='_rd_photo_id_pilot';
export function lineFor(run){return {title:run.side==='front-only'?'Photo ID Badge Pilot — Front only':'Photo ID Badge Pilot — Front and back',quantity:run.quantity,requiresShipping:true,taxable:true,originalUnitPriceWithCurrency:{amount:(run.unitCents/100).toFixed(2),currencyCode:'USD'},customAttributes:[{key:reference,value:run.id}]};}
function sameLine(connection,run){const line=connection?.nodes?.[0],expected=lineFor(run);return connection?.pageInfo?.hasNextPage===false&&connection.nodes.length===1&&line.title===expected.title&&line.quantity===run.quantity&&line.requiresShipping===true&&line.taxable===true&&moneyCents(line.originalUnitPriceSet)===run.unitCents&&line.customAttributes?.some(a=>a.key===reference&&a.value===run.id);}
export function verifyDraft(draft,run){
 if(!draft||draft.id!==run.draftId||!sameLine(draft.lineItems,run)||moneyCents(draft.subtotalPriceSet)!==run.subtotalCents||moneyCents(draft.totalShippingPriceSet)!==(run.delivery==='troy'?0:800))fail(409,'DRAFT_DETAILS_NEED_REVIEW');
 if(run.delivery==='troy'&&(draft.shippingLine?.custom!==false||draft.shippingLine.deliveryCategory!=='pick-up'||draft.shippingLine.code!==run.pickup.code||draft.shippingLine.source!==run.pickup.source))fail(409,'NATIVE_PICKUP_NEEDS_REVIEW');
 let url;try{url=new URL(draft.invoiceUrl||(draft.order&&run.checkoutUrl));}catch{fail(409,'CHECKOUT_LINK_UNVERIFIED');}
 if(url.protocol!=='https:'||url.hostname!==TEST_SHOP||!/^\/(?:\d+\/)?invoices\/[a-z0-9_-]+\/?$/i.test(url.pathname))fail(409,'CHECKOUT_LINK_UNVERIFIED');
 const order=draft.order;
 if(!order||!order.fullyPaid||order.displayFinancialStatus!=='PAID')return {checkoutUrl:url.href,paid:false};
 const transactions=order.transactions;
 if(!order.test||order.cancelledAt||order.displayFulfillmentStatus!=='UNFULFILLED'||order.email?.toLowerCase()!==PILOT_OWNER||!sameLine(order.lineItems,run)||order.lineItems.nodes[0].currentQuantity!==run.quantity||moneyCents(order.subtotalPriceSet)!==run.subtotalCents||moneyCents(order.totalRefundedSet)!==0||!Array.isArray(transactions)||transactions.length>=20||transactions.some(t=>t.kind==='REFUND'))fail(409,'TEST_PAYMENT_NEEDS_REVIEW');
 const captures=transactions.filter(t=>['SALE','CAPTURE'].includes(t.kind)&&t.status==='SUCCESS');
 if(!captures.length||captures.some(t=>t.test!==true||moneyCents(t.amountSet)===null)||captures.reduce((n,t)=>n+moneyCents(t.amountSet),0)!==moneyCents(order.totalPriceSet))fail(409,'TEST_CAPTURE_UNVERIFIED');
 return {checkoutUrl:url.href,paid:true,orderId:order.id,orderName:order.name,totalCents:moneyCents(order.totalPriceSet)};
}
export function createPhotoPilotShopify({secret,fetcher=fetch,now=Date.now}){
 let token,expires=0;
 const configured=typeof secret==='string'&&secret.length>10;
 async function graphql(query,variables={}){
  if(!token||expires<=now())fail(503,'TEST_CHECKOUT_SETUP_REQUIRED');
  let response,data;try{response=await fetcher(`https://${TEST_SHOP}/admin/api/${API_VERSION}/graphql.json`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20_000),headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables})});const text=await response.text();if(text.length>1_000_000)throw Error();data=JSON.parse(text);}catch{fail(502,'TEST_STORE_CONNECTION_FAILED');}
  if(!response.ok||data.errors?.length||!data.data)fail(502,'TEST_STORE_REQUEST_FAILED');return data.data;
 }
 async function connect(){
  if(!configured)fail(503,'TEST_CHECKOUT_SETUP_REQUIRED');
  if(token&&expires>now()+30_000)return;
  let response,data;try{response=await fetcher(`https://${TEST_SHOP}/admin/oauth/access_token`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20_000),headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:CLIENT_ID,client_secret:secret})});data=await response.json();}catch{fail(502,'TEST_STORE_CONNECTION_FAILED');}
  if(!response.ok||typeof data.access_token!=='string'||!/^[A-Za-z0-9_-]{16,256}$/.test(data.access_token)||!Number.isFinite(data.expires_in)||data.expires_in<60)fail(503,'TEST_APP_CREDENTIAL_REJECTED');
  token=data.access_token;expires=now()+Math.min(86400,data.expires_in)*1000;
  try{const d=await graphql(IDENTITY),scopes=d.currentAppInstallation?.accessScopes?.map(s=>s.handle).sort();if(d.shop?.id!==SHOP_ID||d.shop.myshopifyDomain!==TEST_SHOP||d.shop.currencyCode!=='USD'||d.currentAppInstallation?.app?.id!==APP_ID||JSON.stringify(scopes)!==JSON.stringify(['read_draft_orders','read_orders','write_draft_orders']))fail(403,'ISOLATED_TEST_APP_REQUIRED');}catch(e){token=undefined;expires=0;throw e;}
 }
 return {configured,async preflight(run){await connect();if(run.delivery!=='troy')return null;const data=await graphql(DELIVERY,{input:{shippingAddress:TEST_ADDRESS,lineItems:[lineFor(run)]}}),options=data.draftOrderAvailableDeliveryOptions;if(options?.pageInfo?.hasNextPage!==false)fail(409,'PICKUP_LOOKUP_INCOMPLETE');const matches=options.availableLocalPickupOptions?.filter(o=>o.locationId===PICKUP_ID);if(matches?.length!==1||!matches[0].handle||!matches[0].code||!matches[0].source)fail(409,'TROY_TEST_PICKUP_UNAVAILABLE');return matches[0];},
  async create(run){await connect();const input={email:PILOT_OWNER,note:'Private Photo ID pilot. Test store only. Do not fulfill.',tags:['photo-id-pilot','proof-required','do-not-fulfill'],presentmentCurrencyCode:'USD',lineItems:[lineFor(run)],shippingAddress:TEST_ADDRESS,shippingLine:run.delivery==='troy'?{shippingRateHandle:run.pickup.handle}:{title:'Standard test shipping',priceWithCurrency:{amount:'8.00',currencyCode:'USD'}}};const data=await graphql(CREATE,{input}),created=data.draftOrderCreate;const id=created?.draftOrder?.id;if(created?.userErrors?.length){if(/^gid:\/\/shopify\/DraftOrder\/[1-9]\d+$/.test(id??'')){const e=new Error('CREATE_RESULT_UNCERTAIN');e.code='CREATE_RESULT_UNCERTAIN';e.draftId=id;throw e;}fail(422,'TEST_DRAFT_REJECTED');}if(!/^gid:\/\/shopify\/DraftOrder\/[1-9]\d+$/.test(id??''))fail(502,'CREATE_RESULT_UNCERTAIN');return id;},
  async read(run){await connect();const data=await graphql(READ,{id:run.draftId});return verifyDraft(data.draftOrder,run);}
 };
}
